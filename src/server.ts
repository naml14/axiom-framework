// ============================================================
// axiom-framework — Server Wrapper
// ============================================================

import { isAbsolute, relative, resolve } from 'node:path'
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
}

export interface AxiomServer {
  serve(): void
  stop(): void
  port: number
}

interface BunFileLike extends Blob {
  exists(): Promise<boolean>
}

interface BunServerInstance {
  port: number
  stop(): void
}

interface BunServerRuntime {
  file(path: string): BunFileLike
  serve(options: {
    port: number
    fetch(req: Request): Response | Promise<Response>
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
  const configuredPort = options.port ?? 3000
  let server: BunServerInstance | null = null
  const bun = getBunRuntime()

  // Track actual port (Bun may assign a random one if port is 0).
  let actualPort = configuredPort

  const api: AxiomServer = {
    get port() { return actualPort },
    serve() {
      server = bun.serve({
        port: configuredPort,
        async fetch(req: Request) {
          const url = new URL(req.url)

          // Try static file first
          if (staticDir) {
            const filePath = resolveStaticFilePath(staticDir, url.pathname)
            if (filePath !== null) {
              const file = bun.file(filePath)
              if (await file.exists()) {
                return new Response(file)
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
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            }
          }

          // 404
          return new Response('Not Found', { status: 404 })
        },
      })
      actualPort = server.port
    },
    stop() {
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
