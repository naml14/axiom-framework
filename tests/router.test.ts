import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Window } from 'happy-dom'
import {
  createRouter,
  createApp,
  defineAsyncComponent,
  defineComponent,
  effect,
} from '../src/index.js'

function setupDOM() {
  const window = new Window()
  window.happyDOM.setURL('http://localhost/')
  globalThis.window = window as unknown as typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
  globalThis.PopStateEvent = window.PopStateEvent as unknown as typeof PopStateEvent
  globalThis.requestAnimationFrame = ((cb: () => void) => {
    cb()
    return 0
  }) as typeof requestAnimationFrame
  return window
}

const fakeTextEngine = {
  prepare: (text: string, _font: string) => ({ text }),
  layout: (_p: unknown, _maxWidth: number, lh: number) => ({ lineCount: 1, height: lh }),
  clearCache: () => {},
}

function makeComponent(name: string) {
  return defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: [{ type: 'text' as const, content: name }],
  }))
}

function simulatePopState(path: string): void {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}

beforeAll(() => {
  setupDOM()
})

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('router: scaffolding and core behavior (RED)', () => {
  test('createRouter returns router shape with signal-like $route', () => {
    const About = makeComponent('About')
    const router = createRouter([{ path: '/about', component: About }])

    expect(typeof router.push).toBe('function')
    expect(typeof router.replace).toBe('function')
    expect(typeof router.go).toBe('function')
    expect(router.$route).toBeDefined()
    expect('value' in (router as any).$route).toBe(true)
    expect(() => {
      ;(router.$route as any).value = router.$route.value
    }).not.toThrow()
  })

  test('matches static route /about and root /', () => {
    const Home = makeComponent('Home')
    const About = makeComponent('About')
    const router = createRouter([
      { path: '/', component: Home },
      { path: '/about', component: About },
    ])

    router.push('/about')
    expect(router.$route.value.path).toBe('/about')
    expect(router.$route.value.matched?.path).toBe('/about')

    router.push('/')
    expect(router.$route.value.matched?.path).toBe('/')
    expect(router.$route.value.params).toEqual({})
  })

  test('extracts dynamic params for one and multiple segments', () => {
    const User = makeComponent('User')
    const Comment = makeComponent('Comment')
    const router = createRouter([
      { path: '/user/:id', component: User },
      { path: '/post/:slug/comment/:cid', component: Comment },
    ])

    router.push('/user/42')
    expect(router.$route.value.matched?.path).toBe('/user/:id')
    expect(router.$route.value.params.id).toBe('42')

    router.push('/post/hello-world/comment/99')
    expect(router.$route.value.params.slug).toBe('hello-world')
    expect(router.$route.value.params.cid).toBe('99')
  })

  test('decodes URL-encoded dynamic params', () => {
    const Search = makeComponent('Search')
    const router = createRouter([{ path: '/search/:term', component: Search }])

    router.push('/search/hello%20world')
    expect(router.$route.value.params.term).toBe('hello world')
  })

  test('malformed encoded path segment does not throw', () => {
    const Search = makeComponent('Search')
    const router = createRouter([{ path: '/search/:term', component: Search }])

    expect(() => router.push('/search/%E0')).not.toThrow()
    expect(router.$route.value.params.term).toBe('%E0')
  })

  test('prefers static route over dynamic when both match', () => {
    const Profile = makeComponent('Profile')
    const User = makeComponent('User')
    const router = createRouter([
      { path: '/user/profile', component: Profile },
      { path: '/user/:id', component: User },
    ])

    router.push('/user/profile')
    expect(router.$route.value.matched?.component).toBe(Profile)
  })

  test('parses query params and returns empty query when missing', () => {
    const Search = makeComponent('Search')
    const router = createRouter([{ path: '/search', component: Search }])

    router.push('/search?q=hello&page=2')
    expect(router.$route.value.path).toBe('/search')
    expect(router.$route.value.query).toEqual({ q: 'hello', page: '2' })

    router.push('/search')
    expect(router.$route.value.query).toEqual({})
  })

  test('tolerates malformed query encoding and keeps router alive', () => {
    const Search = makeComponent('Search')
    const router = createRouter([{ path: '/search', component: Search }])

    expect(() => router.push('/search?q=%E0')).not.toThrow()
    expect(router.$route.value.path).toBe('/search')
    expect(router.$route.value.query.q).toBe('%E0')
  })

  test('supports flag-like query params without equals sign', () => {
    const Search = makeComponent('Search')
    const router = createRouter([{ path: '/search', component: Search }])

    router.push('/search?debug')
    expect(router.$route.value.query.debug).toBe('')
  })

  test('parses hash and uses empty hash fallback', () => {
    const Docs = makeComponent('Docs')
    const router = createRouter([{ path: '/docs', component: Docs }])

    router.push('/docs#installation')
    expect(router.$route.value.hash).toBe('installation')
    expect(router.$route.value.path).toBe('/docs')

    router.push('/docs')
    expect(router.$route.value.hash).toBe('')
  })

  test('supports wildcard catch-all and only uses it as last resort', () => {
    const Home = makeComponent('Home')
    const About = makeComponent('About')
    const NotFound = makeComponent('NotFound')
    const router = createRouter([
      { path: '/', component: Home },
      { path: '/about', component: About },
      { path: '*', component: NotFound },
    ])

    router.push('/does-not-exist')
    expect(router.$route.value.matched?.component).toBe(NotFound)
    expect(router.$route.value.params).toEqual({})

    router.push('/about')
    expect(router.$route.value.matched?.path).toBe('/about')
  })

  test('RouteState has consistent shape and initializes from location', () => {
    const App = makeComponent('App')
    window.history.replaceState(null, '', '/app')

    const router = createRouter([{ path: '/app', component: App }])
    expect(router.$route.value.path).toBe('/app')
    expect(router.$route.value.params).toEqual({})
    expect(router.$route.value.query).toEqual({})
    expect(typeof router.$route.value.hash).toBe('string')
    expect(router.$route.value.matched?.path).toBe('/app')
  })
})

describe('router: navigation + signals (RED)', () => {
  test('push updates signal and calls history.pushState', () => {
    const A = makeComponent('A')
    const B = makeComponent('B')
    const router = createRouter([
      { path: '/a', component: A },
      { path: '/b', component: B },
    ])

    const originalPush = window.history.pushState.bind(window.history)
    const pushCalls: Array<[unknown, string, string | URL | null | undefined]> = []

    try {
      window.history.pushState = (state, title, url) => {
        pushCalls.push([state, title, url])
        originalPush(state, title, url)
      }

      router.push('/b')

      expect(router.$route.value.path).toBe('/b')
      expect(pushCalls.length).toBeGreaterThan(0)
      expect(pushCalls[0]?.[2]).toBe('/b')
    } finally {
      window.history.pushState = originalPush
    }
  })

  test('push is signal-first: effect sees new route before pushState side-effect ordering', () => {
    const A = makeComponent('A')
    const B = makeComponent('B')
    const router = createRouter([
      { path: '/a', component: A },
      { path: '/b', component: B },
    ])

    const events: string[] = []
    const originalPush = window.history.pushState.bind(window.history)
    let stop: (() => void) | null = null
    try {
      window.history.pushState = (state, title, url) => {
        events.push(`pushState:${String(url)}`)
        originalPush(state, title, url)
      }

      stop = effect(() => {
        events.push(`effect:${router.$route.value.path}`)
      })

      router.push('/b')

      const effectIdx = events.findIndex((e) => e === 'effect:/b')
      const pushIdx = events.findIndex((e) => e === 'pushState:/b')
      expect(effectIdx).toBeGreaterThanOrEqual(0)
      expect(pushIdx).toBeGreaterThanOrEqual(0)
      expect(effectIdx).toBeLessThan(pushIdx)
    } finally {
      stop?.()
      window.history.pushState = originalPush
    }
  })

  test('replace updates signal, calls replaceState, and not pushState', () => {
    const A = makeComponent('A')
    const B = makeComponent('B')
    const router = createRouter([
      { path: '/a', component: A },
      { path: '/b', component: B },
    ])

    let replaceCalls = 0
    let pushCalls = 0

    const originalReplace = window.history.replaceState.bind(window.history)
    const originalPush = window.history.pushState.bind(window.history)

    try {
      window.history.replaceState = (state, title, url) => {
        replaceCalls++
        originalReplace(state, title, url)
      }

      window.history.pushState = (state, title, url) => {
        pushCalls++
        originalPush(state, title, url)
      }

      router.replace('/b')

      expect(router.$route.value.path).toBe('/b')
      expect(replaceCalls).toBe(1)
      expect(pushCalls).toBe(0)
    } finally {
      window.history.replaceState = originalReplace
      window.history.pushState = originalPush
    }
  })

  test('go(n) delegates to history.go and go(0) is no-op', () => {
    const A = makeComponent('A')
    const router = createRouter([{ path: '/a', component: A }])

    const args: number[] = []
    const originalGo = window.history.go.bind(window.history)

    try {
      window.history.go = (n?: number) => {
        args.push(n ?? 0)
        originalGo(n)
      }

      router.go(-1)
      expect(args).toContain(-1)

      const before = args.length
      router.go(0)
      expect(args.length).toBe(before)
    } finally {
      window.history.go = originalGo
    }
  })

  test('popstate sync updates route and supports back sequence simulation', () => {
    const Home = makeComponent('Home')
    const About = makeComponent('About')
    const router = createRouter([
      { path: '/home', component: Home },
      { path: '/about', component: About },
    ])

    router.push('/about')
    simulatePopState('/home')
    expect(router.$route.value.path).toBe('/home')
    expect(router.$route.value.matched?.path).toBe('/home')
  })

  test('signal integration: read outside effect is safe, inside effect reacts', () => {
    const A = makeComponent('A')
    const B = makeComponent('B')
    const router = createRouter([
      { path: '/a', component: A },
      { path: '/b', component: B },
    ])

    expect(() => router.$route.value).not.toThrow()

    let captured = ''
    const stop = effect(() => {
      captured = router.$route.value.path
    })

    router.push('/b')
    expect(captured).toBe('/b')

    stop()
  })
})

describe('router: app + async integration (RED)', () => {
  test('createApp works without router and accepts router option', () => {
    const Root = makeComponent('Root')
    const rootEl = document.createElement('div')

    const appNoRouter = createApp(Root, rootEl, { textEngine: fakeTextEngine })
    expect(() => {
      appNoRouter.mount()
      appNoRouter.unmount()
    }).not.toThrow()

    const Home = makeComponent('Home')
    const router = createRouter([{ path: '/', component: Home }])
    const appWithRouter = createApp(Root, rootEl, { textEngine: fakeTextEngine, router })

    expect(() => {
      appWithRouter.mount()
      appWithRouter.unmount()
    }).not.toThrow()

    const removeSpy = mock(window.removeEventListener)
    const originalRemove = window.removeEventListener
    window.removeEventListener = removeSpy as typeof window.removeEventListener

    try {
      const appWithRouterCleanup = createApp(Root, rootEl, {
        textEngine: fakeTextEngine,
        router,
      })

      appWithRouterCleanup.mount()
      appWithRouterCleanup.unmount()

      expect(removeSpy).toHaveBeenCalled()
      const popstateRemoval = removeSpy.mock.calls.some(
        (call) => call?.[0] === 'popstate'
      )
      expect(popstateRemoval).toBe(true)
    } finally {
      window.removeEventListener = originalRemove
    }
  })

  test('defineAsyncComponent returns ComponentDefinition and renders empty while pending', () => {
    let resolveLoader: ((value: { default: ReturnType<typeof makeComponent> }) => void) | undefined

    const loader = () =>
      new Promise<{ default: ReturnType<typeof makeComponent> }>((resolve) => {
        resolveLoader = resolve
      })

    const AsyncPage = defineAsyncComponent(loader)
    expect(typeof AsyncPage._fn).toBe('function')

    const pendingOutput = AsyncPage._fn(undefined as void)
    expect(pendingOutput.type).toBe('fragment')
    if (pendingOutput.type !== 'fragment') {
      throw new Error('Expected fragment while async component is pending')
    }
    expect(pendingOutput.children).toEqual([])

    resolveLoader?.({ default: makeComponent('Loaded') })
  })

  test('async resolve renders real component after microtask and loader called once', async () => {
    const Real = makeComponent('Real')
    const loader = mock(() => Promise.resolve({ default: Real }))

    const AsyncPage = defineAsyncComponent(loader)
    const first = AsyncPage._fn(undefined as void)
    const second = AsyncPage._fn(undefined as void)
    expect(first.type).toBe('fragment')
    expect(second.type).toBe('fragment')

    await new Promise((resolve) => setTimeout(resolve, 0))

    const after = AsyncPage._fn(undefined as void)
    expect(after.type).toBe('element')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('async loader rejection is silent fail (no throw, still empty)', async () => {
    const AsyncPage = defineAsyncComponent<void>(() => Promise.reject(new Error('failed')))

    expect(() => AsyncPage._fn(undefined as void)).not.toThrow()
    await Promise.resolve()
    const out = AsyncPage._fn(undefined as void)
    expect(out.type).toBe('fragment')
    if (out.type !== 'fragment') {
      throw new Error('Expected fragment after async loader rejection')
    }
    expect(out.children).toEqual([])
  })

  test('async route component renders through router+app after loader resolves', async () => {
    const Real = makeComponent('Real (router)')
    const loader = mock(() => Promise.resolve({ default: Real }))
    const AsyncPage = defineAsyncComponent(loader)

    const router = createRouter([{ path: '/async', component: AsyncPage }])

    const Root = defineComponent(() => {
      const matched = router.$route.value.matched?.component
      if (matched) {
        return matched._fn(undefined as never)
      }
      return { type: 'fragment' as const, children: [] }
    })

    const rootEl = document.createElement('div')
    const app = createApp(Root, rootEl, { textEngine: fakeTextEngine, router })

    app.mount()
    router.push('/async')

    expect(rootEl.textContent ?? '').toBe('')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(rootEl.textContent ?? '').toContain('Real (router)')
    expect(loader).toHaveBeenCalledTimes(1)

    app.unmount()
  })
})

describe('router: edge cases (RED)', () => {
  test('createRouter([]) does not throw and unmatched path sets matched null', () => {
    const router = createRouter([])

    expect(() => router.push('/does-not-exist')).not.toThrow()
    expect(router.$route.value.matched).toBeNull()
    expect(router.$route.value.path).toBe('/does-not-exist')
  })

  test('trailing slash normalization: /about/ resolves to /about', () => {
    const About = makeComponent('About')
    const router = createRouter([{ path: '/about', component: About }])

    router.push('/about/')
    expect(router.$route.value.path).toBe('/about')
    expect(router.$route.value.matched?.path).toBe('/about')
  })
})
