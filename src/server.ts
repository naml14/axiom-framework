// ============================================================
// axiom-framework — Server Wrapper
// ============================================================

import type { ComponentDefinition } from './core/types.js'
import type { StreamSSROptions } from './ssr-stream.js'
import { renderToReadableStream } from './ssr-stream.js'

// ============================================================
// Types
// ============================================================

export interface AxiomServerOptions {
  routes: Array<{
    path: string
    component: ComponentDefinition<void>
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
  let server: ReturnType<typeof Bun.serve> | null = null

  // Track actual port (Bun may assign a random one if port is 0).
  let actualPort = configuredPort

  const api: AxiomServer = {
    get port() { return actualPort },
    serve() {
      server = Bun.serve({
        port: configuredPort,
        async fetch(req) {
          const url = new URL(req.url)

          // Try static file first
          if (staticDir) {
            const filePath = staticDir + url.pathname
            const file = Bun.file(filePath)
            if (await file.exists()) {
              return new Response(file)
            }
          }

          // Try route match
          for (const route of routes) {
            if (matchRoute(url.pathname, route.path)) {
              const stream = renderToReadableStream(route.component, ssr)
              return new Response(stream, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            }
          }

          // 404
          return new Response('Not Found', { status: 404 })
        },
      })
      actualPort = server!.port as number
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
