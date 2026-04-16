import type { Signal, ComponentDefinition } from './core/types.js'
import { signal } from './reactivity/signals.js'

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
  dispose(): void
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

function createSafeDict(): Record<string, string> {
  return Object.create(null) as Record<string, string>
}

const SAFE_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/

function isSafeKey(key: string): boolean {
  if (!key) return false
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    return false
  }
  return SAFE_KEY_PATTERN.test(key)
}

function toSafeRecord(entries: Array<[string, string]>): Record<string, string> {
  if (entries.length === 0) return createSafeDict()
  return Object.fromEntries(entries) as Record<string, string>
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// ============================================================
// Utilities (signatures only in Phase 1)
// ============================================================

function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function normalizeFullPath(fullPath: string): string {
  const { pathname, query, hash } = parseURL(fullPath)
  const normalizedPathname = normalizePath(pathname)
  const search = Object.keys(query).length
    ? `?${Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')}`
    : ''
  const hashSuffix = hash ? `#${hash}` : ''
  return `${normalizedPathname}${search}${hashSuffix}`
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

  const queryEntries: Array<[string, string]> = []
  if (queryStr) {
    for (const pair of queryStr.split('&')) {
      if (!pair) continue
      const eqIdx = pair.indexOf('=')
      const keyRaw = eqIdx < 0 ? pair : pair.slice(0, eqIdx)
      const valueRaw = eqIdx < 0 ? '' : pair.slice(eqIdx + 1)
      const key = safeDecode(keyRaw)
      const value = safeDecode(valueRaw)
      if (!isSafeKey(key)) continue
      queryEntries.push([key, value])
    }
  }

  return { pathname, query: toSafeRecord(queryEntries), hash }
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
      return { route: parsed.route, params: createSafeDict() }
    }

    if (parsed.segments.length !== urlSegments.length) {
      continue
    }

    const paramEntries: Array<[string, string]> = []
    let matched = true

    for (let i = 0; i < parsed.segments.length; i++) {
      const segment = parsed.segments[i]!
      const rawUrlSegment = urlSegments[i]!
      const urlSegment = safeDecode(rawUrlSegment)

      if (segment.kind === 'static') {
        if (segment.value !== urlSegment) {
          matched = false
          break
        }
        continue
      }

      if (segment.kind === 'dynamic') {
        if (isSafeKey(segment.name)) {
          paramEntries.push([segment.name, urlSegment])
        }
        continue
      }

      matched = false
      break
    }

    if (matched) {
      return { route: parsed.route, params: toSafeRecord(paramEntries) }
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
    params: match?.params ?? createSafeDict(),
    query,
    hash,
    matched: match?.route ?? null,
  }
}

// ============================================================
// Public API
// ============================================================

export function createRouter(routes: Route[]): Router {
  const browserWindow = typeof window !== 'undefined' ? window : undefined

  const parsedRoutes: ParsedRoute[] = routes
    .map((route) => {
      const normalizedRoutePath = route.path === '*' ? '*' : normalizePath(route.path)
      const routeForMatch =
        normalizedRoutePath === route.path
          ? route
          : { ...route, path: normalizedRoutePath }
      const segments = parseRoutePattern(routeForMatch.path)
      return {
        route: routeForMatch,
        segments,
        specificity: computeSpecificity(segments),
        isWildcard: routeForMatch.path === '*',
      }
    })
    .sort((a, b) => b.specificity - a.specificity)

  const initialPath =
    browserWindow !== undefined
      ? browserWindow.location.pathname + browserWindow.location.search + browserWindow.location.hash
      : '/'

  const $route = signal<RouteState>(
    buildRouteStateFromPath(initialPath, parsedRoutes)
  )

  const navigate = (fullPath: string, method: 'push' | 'replace'): void => {
    const normalizedFullPath = normalizeFullPath(fullPath)
    $route.value = buildRouteStateFromPath(normalizedFullPath, parsedRoutes)

    if (browserWindow === undefined) return

    if (method === 'push') {
      browserWindow.history.pushState(null, '', normalizedFullPath)
    } else {
      browserWindow.history.replaceState(null, '', normalizedFullPath)
    }
  }

  const popstateHandler = (): void => {
    if (browserWindow === undefined) return

    const fullPath =
      browserWindow.location.pathname + browserWindow.location.search + browserWindow.location.hash
    $route.value = buildRouteStateFromPath(fullPath, parsedRoutes)
  }

  if (browserWindow !== undefined) {
    browserWindow.addEventListener('popstate', popstateHandler)
  }

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
      if (browserWindow === undefined) return
      browserWindow.history.go(n)
    },
    dispose(): void {
      if (browserWindow === undefined) return
      browserWindow.removeEventListener('popstate', popstateHandler)
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
        Promise.resolve()
          .then(loader)
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
