// ============================================================
// axiom-framework — Server Wrapper
// ============================================================

import { isAbsolute, relative, resolve } from 'node:path'
import { statSync } from 'node:fs'
import type { ComponentDefinition } from './core/types.js'
import type { StreamSSROptions, SSRMetadata } from './ssr-stream.js'
import { renderToReadableStream } from './ssr-stream.js'

// ============================================================
// Types
// ============================================================

export interface AxiomServerOptions {
  routes: Array<{
    path: string
    component: ComponentDefinition<void>
    metadata?: SSRMetadata
  }>
  staticDir?: string
  port?: number
  ssr?: StreamSSROptions
  allowedOrigins?: string[]
}

export interface AxiomServer {
  serve(): void
  stop(): void
  port: number
}

interface BunFileLike extends Blob {
  exists(): Promise<boolean>
}

interface BunSocketAddress {
  address: string
}

interface BunServerInstance {
  port: number
  stop(): void
  /** Resolves the real socket address of the connection behind a request. */
  requestIP?(req: Request): BunSocketAddress | null
}

interface BunServerRuntime {
  file(path: string): BunFileLike
  serve(options: {
    port: number
    fetch(req: Request, server: BunServerInstance): Response | Promise<Response>
  }): BunServerInstance
}

function getBunRuntime(): BunServerRuntime {
  const bun = (globalThis as { Bun?: unknown }).Bun as BunServerRuntime | undefined
  if (!bun) {
    throw new Error(
      'createServer() requires the Bun runtime. Run this server with `bun run`.'
    )
  }
  return bun
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const rel = relative(baseDir, targetPath)
  const topSegment = rel.split(/[\\/]/)[0]
  return rel === '' || (!isAbsolute(rel) && topSegment !== '..')
}

function resolveStaticFilePath(staticDir: string, requestPath: string): string | null {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(requestPath)
  } catch {
    return null
  }

  const staticRoot = resolve(staticDir)
  const candidate = resolve(staticRoot, decodedPath.replace(/^[/\\]+/, ''))
  return isPathInside(staticRoot, candidate) ? candidate : null
}

function normalizeAllowedOrigins(allowedOrigins?: string[]): string[] | undefined {
  if (allowedOrigins === undefined) return undefined
  const normalized = new Set<string>()
  for (const raw of allowedOrigins) {
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed === '*') continue
    try {
      // new URL(...).origin canonicalizes to scheme://host[:port], dropping any
      // trailing slash or path so it matches the browser-sent Origin header,
      // which never carries a path. Invalid entries are dropped instead of
      // being kept as unmatchable values.
      const canonical = new URL(trimmed).origin
      if (canonical !== 'null') normalized.add(canonical)
    } catch {
      // Skip malformed origin configuration entries.
    }
  }
  return normalized.size > 0 ? [...normalized] : undefined
}

function validateStaticDir(staticDir: string | undefined): void {
  if (staticDir === undefined) return
  const resolved = resolve(staticDir)
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(resolved)
  } catch {
    throw new Error(`createServer() staticDir does not exist: ${staticDir}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`createServer() staticDir must be a directory: ${staticDir}`)
  }
}


function corsHeaders(req: Request, allowedOrigins?: string[]): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (origin === '') return {}

  // Deny-by-default: when the origin is not on the explicit allowlist we return
  // no CORS headers. Checking membership first also avoids the cost of URL
  // parsing on every request that will be rejected anyway. A wildcard origin
  // can never be present here because normalizeAllowedOrigins() filters it out.
  if (allowedOrigins === undefined || !allowedOrigins.includes(origin)) {
    return {}
  }

  // Defense-in-depth: reject malformed origins even if allowlisted.
  try {
    new URL(origin)
  } catch {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// ============================================================
// Security Headers
// ============================================================

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
}

// ============================================================
// Rate Limiting
// ============================================================

const RATE_LIMIT = 100 // req per minute
const RATE_WINDOW = 60_000 // 1 minute

interface RateLimitState {
  /** Per-client buckets: client identity -> { count, resetAt }. */
  counts: Map<string, { count: number; resetAt: number }>
}

/**
 * Resolves a stable client identity for rate limiting.
 *
 * `cf-connecting-ip` is set by Cloudflare and cannot be forged by the client, so
 * it is preferred over `X-Forwarded-For`. An attacker behind Cloudflare can
 * prepend an arbitrary entry to `X-Forwarded-For`, so trusting its first entry
 * first would let them mint a fresh bucket per request and bypass the limiter.
 *
 * `X-Forwarded-For` may carry a comma-separated chain (`client, proxy1, ...`),
 * so we key on the first entry rather than the raw header value.
 *
 * When no proxy headers are present we fall back to the real socket address via
 * `server.requestIP()`. Without this fallback every direct-to-Bun connection
 * would collapse into a single hardcoded bucket, so one abusive client could
 * rate-limit everyone (a denial of service). `127.0.0.1` is only used as a last
 * resort when the runtime cannot expose a peer address.
 */
function getClientIp(req: Request, server?: BunServerInstance): string {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp !== null && cfIp.length > 0) return cfIp

  const forwarded = req.headers.get('X-Forwarded-For')
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim()
    if (first !== undefined && first.length > 0) return first
  }

  const peer = server?.requestIP?.(req)?.address
  if (peer !== undefined && peer.length > 0) return peer

  return '127.0.0.1'
}

/**
 * Records a request against its client bucket and reports whether the client is
 * now over the limit. State is supplied by the caller so each server instance
 * keeps isolated counters (no shared module-global state).
 */
function isRateLimited(
  state: RateLimitState,
  req: Request,
  server?: BunServerInstance,
): boolean {
  const ip = getClientIp(req, server)
  const now = Date.now()
  let entry = state.counts.get(ip)
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_WINDOW }
    state.counts.set(ip, entry)
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}

// ============================================================
// createServer
// ============================================================

/**
 * Minimal server that integrates Axiom SSR + static file serving.
 * Wraps Bun.serve().
 *
 * @experimental — API may change in minor versions
 */
export function createServer(options: AxiomServerOptions): AxiomServer {
  const { routes, staticDir, ssr } = options
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins)
  const configuredPort = options.port ?? 3000
  validateStaticDir(staticDir)
  let server: BunServerInstance | null = null
  const bun = getBunRuntime()

  // Per-instance rate-limit state: isolated across server instances and released
  // when this server is stopped (no shared module-global counters).
  const rateLimit: RateLimitState = { counts: new Map() }
  let pruneTimer: ReturnType<typeof setInterval> | null = null

  // Track actual port (Bun may assign a random one if port is 0).
  let actualPort = configuredPort

  const api: AxiomServer = {
    get port() { return actualPort },
    serve() {
      server = bun.serve({
        port: configuredPort,
        async fetch(req: Request, srv: BunServerInstance) {
          if (isRateLimited(rateLimit, req, srv)) {
            return new Response('Too Many Requests', {
              status: 429,
              headers: { ...SECURITY_HEADERS, ...corsHeaders(req, allowedOrigins) },
            })
          }

          const url = new URL(req.url)

          // Handle CORS preflight
          if (req.method === 'OPTIONS') {
            return new Response(null, {
              status: 204,
              headers: { ...SECURITY_HEADERS, ...corsHeaders(req, allowedOrigins) },
            })
          }

          // Try static file first
          if (staticDir) {
            const filePath = resolveStaticFilePath(staticDir, url.pathname)
            if (filePath !== null) {
              const file = bun.file(filePath)
              if (await file.exists()) {
                return new Response(file, {
                  headers: { ...SECURITY_HEADERS, ...corsHeaders(req, allowedOrigins) },
                })
              }
            }
          }

          // Try route match
          for (const route of routes) {
            if (matchRoute(url.pathname, route.path)) {
              const stream = renderToReadableStream(route.component, {
                ...ssr,
                metadata: route.metadata ?? ssr?.metadata,
              })
              return new Response(stream, {
                headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...corsHeaders(req, allowedOrigins) },
              })
            }
          }

          // 404
          return new Response('Not Found', {
            status: 404,
            headers: { ...SECURITY_HEADERS, ...corsHeaders(req, allowedOrigins) },
          })
        },
      })
      actualPort = server.port

      // Prune expired buckets off the request hot path so no single request pays
      // for a full-map sweep, even under high client-IP cardinality. The timer is
      // unref'd so it never keeps the process alive, and stop() clears it.
      pruneTimer = setInterval(() => {
        const now = Date.now()
        for (const [ip, entry] of rateLimit.counts) {
          if (now > entry.resetAt) rateLimit.counts.delete(ip)
        }
      }, RATE_WINDOW)
      pruneTimer.unref?.()
    },
    stop() {
      if (pruneTimer !== null) {
        clearInterval(pruneTimer)
        pruneTimer = null
      }
      rateLimit.counts.clear()
      server?.stop()
      server = null
    },
  }

  return api
}

// Simple path matching — supports exact and /:param patterns
function matchRoute(urlPath: string, routePath: string): boolean {
  if (routePath === urlPath) return true
  if (routePath === '*') return true

  const urlParts = urlPath.split('/').filter(Boolean)
  const routeParts = routePath.split('/').filter(Boolean)

  if (urlParts.length !== routeParts.length) return false

  return routeParts.every((part, i) =>
    part.startsWith(':') || part === urlParts[i]
  )
}
