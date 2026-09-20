// ============================================================
// demo/router-demo.ts — Router + Async Component Demo
//
// Demuestra:
//  - createRouter con rutas estáticas + dinámicas + wildcard
//  - defineAsyncComponent con loader simulado
//  - router.push / replace / go / dispose
//  - $route.value reactivo (path, params, query, hash)
//
// Patrón: los botones son static HTML fuera del árbol Axiom.
// addEventListener es el escape-hatch correcto para integración browser-level.
// Los elementos Axiom-owned usarían `on: { click: fn }` dentro del component tree.
// ============================================================

import {
  defineComponent,
  createApp,
  createRouter,
  defineAsyncComponent,
  h,
  stack,
} from '../src/index.ts'
import type { Route, Router, RouteState } from '../src/index.ts'

// ============================================================
// Rutas
// ============================================================

const Home = defineComponent(() =>
  stack({ gap: 10, padding: 16 },
    h('div', { class: ['hero-badge'] }, '🏠 HOME'),
    h('h2', { class: ['hero-title'] }, 'Bienvenido al Router Demo'),
    h('p', { class: ['hero-body'] },
      'Este demo usa createRouter para gestionar rutas sin librerías externas. ' +
      'La URL del navegador se sincroniza con el signal $route, y los componentes ' +
      'se re-montan según la ruta activa.',
    ),
  )
)

const About = defineComponent(() =>
  stack({ gap: 10, padding: 16 },
    h('div', { class: ['hero-badge'] }, 'ℹ️ ABOUT'),
    h('h2', { class: ['hero-title'] }, 'Acerca de Axiom Router'),
    h('p', { class: ['hero-body'] },
      'Axiom Router soporta rutas estáticas (/about), dinámicas (/users/:id), ' +
      'y wildcard (*). El matching es determinista con specificity score.',
    ),
  )
)

// ============================================================
// UserPage — ruta dinámica /users/:id
// ============================================================

interface UserRecord {
  id: string
  name: string
  role: string
}

const FAKE_USERS: Record<string, UserRecord> = {
  '1': { id: '1', name: 'Ada Lovelace', role: 'Engineer' },
  '2': { id: '2', name: 'Alan Turing', role: 'Cryptographer' },
  '3': { id: '3', name: 'Grace Hopper', role: 'Compiler Designer' },
}

const UsersIndex = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('div', { class: ['hero-badge'] }, '👥 USERS'),
    h('h2', { class: ['hero-title'] }, 'Lista de usuarios'),
    h('div', { flex: 'column', gap: 4, padding: 0 },
      ...Object.values(FAKE_USERS).map((u) =>
        h('div', {
          class: ['syntax-demo-item'],
          padding: 8,
          attrs: { 'data-user-id': u.id },
        }, `${u.id} — ${u.name} (${u.role})`)
      ),
    ),
    h('p', { class: ['hero-body'] },
      'Tip: navega a /users/1, /users/2 o /users/3 para ver el detalle de cada usuario.',
    ),
  )
)

const NotFound = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('div', { class: ['hero-badge'] }, '🚫 404'),
    h('h2', { class: ['hero-title'] }, 'Página no encontrada'),
    h('p', { class: ['hero-body'] }, 'La ruta solicitada no coincide con ninguna ruta registrada.'),
  )
)

const UserDetail = defineComponent((props: { userId: string }) => {
  const user = FAKE_USERS[props.userId]
  if (user === undefined) {
    return stack({ gap: 8, padding: 16 },
      h('div', { class: ['hero-badge'] }, '⚠️ NOT FOUND'),
      h('h2', { class: ['hero-title'] }, `Usuario "${props.userId}" no existe`),
      h('p', { class: ['hero-body'] }, 'IDs válidos: 1, 2, 3'),
    )
  }
  return stack({ gap: 8, padding: 16 },
    h('div', { class: ['hero-badge'] }, `👤 USER #${user.id}`),
    h('h2', { class: ['hero-title'] }, user.name),
    h('p', { class: ['hero-body'] }, `Role: ${user.role}`),
    h('p', { class: ['hero-body'] }, `ID param: "${props.userId}"`),
  )
})

// ============================================================
// AsyncComponent demo — simula carga lazy con setTimeout
// ============================================================

const AsyncFallback = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('div', { class: ['hero-badge'] }, '⏳ ASYNC'),
    h('h2', { class: ['hero-title'] }, 'Cargando componente async…'),
    h('p', { class: ['hero-body'] }, 'defineAsyncComponent espera un loader que retorne Promise<{ default: ComponentDefinition }>.'),
  )
)

const LazyDashboard = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('div', { class: ['hero-badge'] }, '📦 LAZY DASHBOARD'),
    h('h2', { class: ['hero-title'] }, 'Cargado dinámicamente'),
    h('p', { class: ['hero-body'] },
      'Este componente fue cargado vía defineAsyncComponent con un delay simulado de 500ms. ' +
      'Mientras carga, renderiza el fallback.',
    ),
  )
)

const AsyncDashboard = defineAsyncComponent(
  () =>
    new Promise<{ default: typeof LazyDashboard }>((resolve) => {
      setTimeout(() => resolve({ default: LazyDashboard }), 500)
    }),
  { errorFallback: AsyncFallback },
)

// ============================================================
// Router setup
// ============================================================

export function initRouterDemo(): void {
  const container = document.getElementById('router-demo-root')
  const outputEl = document.getElementById('router-output')
  const navHome = document.getElementById('router-nav-home')
  const navAbout = document.getElementById('router-nav-about')
  const navUsers = document.getElementById('router-nav-users')
  const navUser1 = document.getElementById('router-nav-user-1')
  const navUser2 = document.getElementById('router-nav-user-2')
  const navUser3 = document.getElementById('router-nav-user-3')
  const navAsync = document.getElementById('router-nav-async')
  const nav404 = document.getElementById('router-nav-404')
  const navBack = document.getElementById('router-nav-back')
  const navForward = document.getElementById('router-nav-forward')
  const navReplace = document.getElementById('router-nav-replace')

  if (
    container === null || outputEl === null ||
    navHome === null || navAbout === null || navUsers === null ||
    navUser1 === null || navUser2 === null || navUser3 === null ||
    navAsync === null || nav404 === null ||
    navBack === null || navForward === null || navReplace === null
  ) {
    console.warn('[RouterDemo] Faltan elementos en el DOM')
    return
  }

  const routes: Route[] = [
    { path: '/', component: Home, name: 'home' },
    { path: '/about', component: About, name: 'about' },
    { path: '/users', component: UsersIndex, name: 'users' },
    { path: '/users/:id', component: UserDetail, name: 'user-detail' },
    { path: '/async', component: AsyncDashboard, name: 'async' },
    { path: '*', component: NotFound, name: 'not-found' },
  ]

  const router: Router = createRouter(routes)

  // ============================================================
  // RouteView — re-monta el componente de la ruta activa
  // ============================================================

  const RouteView = defineComponent(() => {
    const route: RouteState = router.$route.value
    const match = route.matched
    if (match === null) return NotFound()

    if (match.name === 'user-detail') {
      return UserDetail({ userId: route.params['id'] ?? '' })
    }

    return match.component._fn(undefined as never)
  })

  const app = createApp(RouteView, container)
  app.mount()

  // Inspector update via rAF poll (lightweight, no monkey-patching)
  let lastRoute = router.$route.value
  let rafId = 0
  const tick = (): void => {
    const current = router.$route.value
    if (current !== lastRoute) {
      lastRoute = current
      updateInspector(current)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  function updateInspector(route: RouteState): void {
    if (outputEl === null) return
    const matched = route.matched
    outputEl.textContent = JSON.stringify(
      {
        path: route.path,
        params: route.params,
        query: route.query,
        hash: route.hash,
        matched: matched !== null ? { name: matched.name, path: matched.path } : null,
      },
      null,
      2,
    )
  }

  updateInspector(router.$route.value)

  // ============================================================
  // Nav button handlers (escape hatch: addEventListener)
  // ============================================================

  navHome.addEventListener('click', () => router.push('/'))
  navAbout.addEventListener('click', () => router.push('/about'))
  navUsers.addEventListener('click', () => router.push('/users'))
  navUser1.addEventListener('click', () => router.push('/users/1'))
  navUser2.addEventListener('click', () => router.push('/users/2'))
  navUser3.addEventListener('click', () => router.push('/users/3'))
  navAsync.addEventListener('click', () => router.push('/async'))
  nav404.addEventListener('click', () => router.push('/this-route-does-not-exist'))
  navReplace.addEventListener('click', () => router.replace('/about'))
  navBack.addEventListener('click', () => router.go(-1))
  navForward.addEventListener('click', () => router.go(1))

  // Cleanup hook for hot-reload safety
  ;(window as { __ROUTER_DEMO_CLEANUP__?: () => void }).__ROUTER_DEMO_CLEANUP__ = () => {
    cancelAnimationFrame(rafId)
    router.dispose()
    app.unmount()
  }
}
