import { describe, expect, test } from 'bun:test'
import type { ComponentNode } from '../src/core/types.js'
import { defineComponent } from '../src/render/component.js'
import { effect, signal } from '../src/reactivity/signals.js'
import { createRouter, createRouteOutlet, defineAsyncComponent } from '../src/router.js'
import type { Route, RouteState } from '../src/router.js'

const text = (content: string): ComponentNode => ({ type: 'text', content })
const Fallback = defineComponent(() => text('Not found'))

// Exercise the signal-only outlet independently of browser/router integration.
function routeSignal(matched: Route | null) {
  return signal<RouteState>({ path: '/', params: {}, query: {}, hash: '', matched })
}

describe('createRouteOutlet', () => {
  test('invokes the matched component without props by default', () => {
    let received: unknown = 'not called'
    const Home = defineComponent((props: void) => {
      received = props
      return text('Home')
    })
    const route: Route = { path: '/', component: Home }
    const outlet = createRouteOutlet(routeSignal(route), [route], Fallback)

    expect(typeof outlet._id).toBe('symbol')
    expect(outlet._fn()).toEqual(text('Home'))
    expect(received).toBeUndefined()
  })

  test('maps the current route params, query and hash to component props', () => {
    const User = defineComponent((props: { id: string; tab: string; hash: string }) =>
      text(`${props.id}:${props.tab}:${props.hash}`))
    const route: Route = {
      path: '/users/:id',
      component: User,
      props: (state) => ({ id: state.params.id, tab: state.query.tab, hash: state.hash }),
    }
    const $route = routeSignal(route)
    $route.value = {
      path: '/users/42', params: { id: '42' }, query: { tab: 'profile' }, hash: 'bio', matched: route,
    }
    const outlet = createRouteOutlet($route, [route], Fallback)

    expect(outlet._fn()).toEqual(text('42:profile:bio'))
  })

  test('uses the fallback when unmatched or absent from the outlet table', () => {
    let calls = 0
    const route: Route = {
      path: '/other',
      component: defineComponent(() => { calls++; return text('Other') }),
    }
    const $route = routeSignal(null)
    const outlet = createRouteOutlet($route, [], Fallback)

    expect(outlet._fn()).toEqual(text('Not found'))
    $route.value = { ...$route.value, matched: route }
    expect(outlet._fn()).toEqual(text('Not found'))
    expect(calls).toBe(0)
  })

  test('navigation reactively changes the rendered component and mapped props', () => {
    const routes: Route[] = [
      { path: '/', component: defineComponent(() => text('Home')) },
      {
        path: '/users/:id',
        component: defineComponent((props: { id: string }) => text(props.id)),
        props: (state) => ({ id: state.params.id }),
      },
    ]
    const router = createRouter(routes)
    router.replace('/')
    const outlet = createRouteOutlet(router.$route, routes, Fallback)
    const rendered: ComponentNode[] = []
    const stop = effect(() => { rendered.push(outlet._fn()) })
    try {
      router.push('/users/1')
      router.replace('/users/2')
      router.push('/missing')
      expect(rendered).toEqual([text('Home'), text('1'), text('2'), text('Not found')])
    } finally {
      stop()
      router.dispose()
    }
  })

  test('preserves existing route normalization and matching specificity', () => {
    const routes: Route[] = [
      { path: '/users/:id', component: defineComponent(() => text('Dynamic')) },
      { path: 'users/profile/', component: defineComponent(() => text('Profile')) },
      { path: '*', component: defineComponent(() => text('Wildcard')) },
    ]
    const router = createRouter(routes)
    const outlet = createRouteOutlet(router.$route, routes, Fallback)
    try {
      router.push('/users/profile/')
      expect(outlet._fn()).toEqual(text('Profile'))
      router.push('/users/42')
      expect(outlet._fn()).toEqual(text('Dynamic'))
      router.push('/other')
      expect(outlet._fn()).toEqual(text('Wildcard'))
    } finally {
      router.dispose()
    }
  })

  test('async components resolve reactively and receive mapped props', async () => {
    const Page = defineComponent((props: { title: string }) => text(props.title))
    const AsyncPage = defineAsyncComponent(async () => ({ default: Page }))
    const route: Route = {
      path: '/', component: AsyncPage, props: () => ({ title: 'Loaded' }),
    }
    const outlet = createRouteOutlet(routeSignal(route), [route], Fallback)
    const rendered: ComponentNode[] = []
    const stop = effect(() => { rendered.push(outlet._fn()) })
    try {
      expect(rendered).toEqual([{ type: 'fragment', children: [] }])
      // Drain the loader's promise chain without a browser or timers.
      for (let i = 0; i < 5; i++) await Promise.resolve()
      expect(rendered).toEqual([{ type: 'fragment', children: [] }, text('Loaded')])
    } finally {
      stop()
    }
  })
})
