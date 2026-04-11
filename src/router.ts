import type { Signal, ComponentDefinition } from './types.js'
import { signal } from './signals.js'

// ============================================================
// Public Router Types
// ============================================================

export interface Route {
  path: string
  component: ComponentDefinition<any>
  name?: string
}

export interface RouteState {
  path: string
  params: Record<string, string>
  query: Record<string, string>
  hash: string
  matched: Route | null
}

export interface Router {
  readonly $route: Signal<RouteState>
  push(path: string): void
  replace(path: string): void
  go(n: number): void
}

// ============================================================
// Internal Types (non-exported)
// ============================================================

type RouteSegment =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic'; name: string }
  | { kind: 'wildcard' }

interface ParsedRoute {
  route: Route
  segments: RouteSegment[]
  specificity: number
  isWildcard: boolean
}

// ============================================================
// Utilities (signatures only in Phase 1)
// ============================================================

function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function parseURL(fullPath: string): {
  pathname: string
  query: Record<string, string>
  hash: string
} {
  let rest = fullPath

  const hashIdx = rest.indexOf('#')
  const hash = hashIdx >= 0 ? rest.slice(hashIdx + 1) : ''
  if (hashIdx >= 0) {
    rest = rest.slice(0, hashIdx)
  }

  const queryIdx = rest.indexOf('?')
  const queryStr = queryIdx >= 0 ? rest.slice(queryIdx + 1) : ''
  const pathname = queryIdx >= 0 ? rest.slice(0, queryIdx) : rest

  const query: Record<string, string> = {}
  if (queryStr) {
    for (const pair of queryStr.split('&')) {
      if (!pair) continue
      const eqIdx = pair.indexOf('=')
      if (eqIdx < 0) continue
      const key = decodeURIComponent(pair.slice(0, eqIdx))
      const value = decodeURIComponent(pair.slice(eqIdx + 1))
      if (key) {
        query[key] = value
      }
    }
  }

  return { pathname, query, hash }
}

function parseRoutePattern(routePath: string): RouteSegment[] {
  if (routePath === '*') return [{ kind: 'wildcard' }]

  const normalized = normalizePath(routePath)
  const parts = normalized === '/' ? [''] : normalized.split('/').slice(1)

  return parts.map((part) => {
    if (part.startsWith(':')) {
      return { kind: 'dynamic', name: part.slice(1) }
    }
    return { kind: 'static', value: part }
  })
}

function computeSpecificity(segments: RouteSegment[]): number {
  if (segments.length === 1 && segments[0]?.kind === 'wildcard') {
    return -1
  }

  return segments.reduce((score, segment) => {
    if (segment.kind === 'static') return score + 10
    if (segment.kind === 'dynamic') return score + 1
    return score - 1
  }, 0)
}

function matchRoute(
  normalizedPathname: string,
  parsedRoutes: ParsedRoute[]
): { route: Route; params: Record<string, string> } | null {
  const urlSegments =
    normalizedPathname === '/'
      ? ['']
      : normalizedPathname.split('/').slice(1)

  for (const parsed of parsedRoutes) {
    if (parsed.isWildcard) {
      return { route: parsed.route, params: {} }
    }

    if (parsed.segments.length !== urlSegments.length) {
      continue
    }

    const params: Record<string, string> = {}
    let matched = true

    for (let i = 0; i < parsed.segments.length; i++) {
      const segment = parsed.segments[i]!
      const urlSegment = urlSegments[i]!

      if (segment.kind === 'static') {
        if (segment.value !== urlSegment) {
          matched = false
          break
        }
        continue
      }

      if (segment.kind === 'dynamic') {
        params[segment.name] = decodeURIComponent(urlSegment)
        continue
      }

      matched = false
      break
    }

    if (matched) {
      return { route: parsed.route, params }
    }
  }

  return null
}

function buildRouteStateFromPath(
  fullPath: string,
  parsedRoutes: ParsedRoute[]
): RouteState {
  const { pathname, query, hash } = parseURL(fullPath)
  const normalizedPathname = normalizePath(pathname)
  const match = matchRoute(normalizedPathname, parsedRoutes)

  return {
    path: normalizedPathname,
    params: match?.params ?? {},
    query,
    hash,
    matched: match?.route ?? null,
  }
}

// ============================================================
// Public API
// ============================================================

export function createRouter(routes: Route[]): Router {
  const parsedRoutes: ParsedRoute[] = routes
    .map((route) => {
      const segments = parseRoutePattern(route.path)
      return {
        route,
        segments,
        specificity: computeSpecificity(segments),
        isWildcard: route.path === '*',
      }
    })
    .sort((a, b) => b.specificity - a.specificity)

  const initialPath =
    window.location.pathname + window.location.search + window.location.hash

  const $route = signal<RouteState>(
    buildRouteStateFromPath(initialPath, parsedRoutes)
  )

  const navigate = (fullPath: string, method: 'push' | 'replace'): void => {
    $route.value = buildRouteStateFromPath(fullPath, parsedRoutes)

    if (method === 'push') {
      window.history.pushState(null, '', fullPath)
    } else {
      window.history.replaceState(null, '', fullPath)
    }
  }

  const popstateHandler = (): void => {
    const fullPath =
      window.location.pathname + window.location.search + window.location.hash
    $route.value = buildRouteStateFromPath(fullPath, parsedRoutes)
  }

  window.addEventListener('popstate', popstateHandler)

  const router = {
    $route,
    push(path: string): void {
      navigate(path, 'push')
    },
    replace(path: string): void {
      navigate(path, 'replace')
    },
    go(n: number): void {
      if (n === 0) return
      window.history.go(n)
    },
    _dispose(): void {
      window.removeEventListener('popstate', popstateHandler)
    },
  }

  return router
}

export function defineAsyncComponent<P = void>(
  loader: () => Promise<{ default: ComponentDefinition<P> }>
): ComponentDefinition<P> {
  const loaded = signal<ComponentDefinition<P> | null>(null)
  let initiated = false

  return {
    _id: Symbol('AsyncComponent'),
    _fn(props: P) {
      if (!initiated) {
        initiated = true
        loader()
          .then((mod) => {
            if (mod?.default) {
              loaded.value = mod.default
            }
          })
          .catch(() => {
            // Silent fail by design: keep rendering empty fragment.
          })
      }

      const component = loaded.value
      if (component !== null) return component._fn(props)
      return { type: 'fragment', children: [] }
    },
  }
}
