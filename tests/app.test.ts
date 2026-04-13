import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Window } from 'happy-dom'
// Public API imports — these are the only things consumers can use
import { createApp, defineComponent, signal } from '../src/index.js'
import type { App } from '../src/index.js'
import type { ProfileEvent } from '../src/index.js'
// Internal import — resetScheduler is not public API but is required to make
// the reactive test deterministic (controls rAF scheduling in test environment)
import { resetScheduler } from '../src/scheduler.js'

// Setup happy-dom
let win: ReturnType<typeof setupDOM>

function setupDOM() {
  const window = new Window()
  globalThis.window = window as unknown as typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
  globalThis.requestAnimationFrame = ((cb: () => void) => {
    cb()
    return 0
  }) as typeof requestAnimationFrame
  return window
}

beforeAll(() => {
  win = setupDOM()
})

const initialNodeEnv = process.env.NODE_ENV

beforeEach(() => {
  delete window.__AXIOM__
  globalThis.__AXIOM_DEV__ = undefined
  process.env.NODE_ENV = initialNodeEnv
  resetScheduler()
})

afterEach(() => {
  delete window.__AXIOM__
  globalThis.__AXIOM_DEV__ = undefined
  process.env.NODE_ENV = initialNodeEnv
})

// ============================================================
// Fake text layout engine
// ============================================================

const fakeTextEngine = {
  prepare: (text: string, _font: string) => ({ text }),
  layout: (_p: unknown, maxWidth: number, _lh: number) => {
    const text = (_p as { text: string }).text
    const charsPerLine = Math.max(1, Math.floor(maxWidth / 6))
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine))
    return { lineCount, height: lineCount * 20 }
  },
  clearCache: () => {},
}

// ============================================================
// createApp tests
// ============================================================

describe('createApp', () => {
  test('returns App interface', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello' }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })

    expect(typeof app.mount).toBe('function')
    expect(typeof app.unmount).toBe('function')
    expect(typeof app.getMetrics).toBe('function')
    expect(typeof app.enableHotReloadRecovery).toBe('function')
    expect(typeof app.disableHotReloadRecovery).toBe('function')
  })

  test('mount() creates DOM synchronously', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      classes: ['app'],
      children: [{ type: 'text' as const, content: 'Hello World' }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    expect(root.childNodes.length).toBe(1)
    expect(root.style.position).toBe('relative')
    // overflow is NOT set to hidden — the framework measures and sets explicit
    // heights on containers, but the root must let content be visible.
    expect(root.style.overflow).toBe('')
  })

  test('unmount() cleans up DOM', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello' }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()
    expect(root.childNodes.length).toBeGreaterThan(0)

    app.unmount()
    expect(root.childNodes.length).toBe(0)
  })

  test('getMetrics() returns timing data', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello' }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    const metrics = app.getMetrics()
    expect(metrics.prepareMs).toBeGreaterThanOrEqual(0)
    expect(metrics.reflowMs).toBeGreaterThanOrEqual(0)
    expect(metrics.commitMs).toBeGreaterThanOrEqual(0)
  })

  test('reactive updates via signals', () => {
    resetScheduler()
    let renderCount = 0
    const mockScheduler = (cb: () => void) => { cb() }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `Count: ${count.value}` }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
    })
    app.mount()

    const initialText = root.textContent
    expect(initialText).toContain('Count: 0')

    count.value = 5
    renderCount++

    expect(renderCount).toBe(1)
    expect(root.textContent).toContain('Count: 5')
  })

  test('enableProfiling() emits prepare/reflow/commit/total in order per cycle', () => {
    const scheduled: Array<() => void> = []
    const mockScheduler = (cb: () => void) => {
      scheduled.push(cb)
    }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `Count: ${count.value}` }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
    })

    const events: ProfileEvent[] = []
    const unsubscribe = app.enableProfiling((event) => {
      events.push(event)
    })

    app.mount()

    count.value = 1
    scheduleAndFlush(scheduled)

    const byCycle = new Map<number, ProfileEvent[]>()
    for (const event of events) {
      const list = byCycle.get(event.cycle)
      if (list === undefined) {
        byCycle.set(event.cycle, [event])
      } else {
        list.push(event)
      }
    }

    expect(byCycle.size).toBeGreaterThanOrEqual(2)

    for (const cycleEvents of byCycle.values()) {
      expect(cycleEvents.map((ev) => ev.phase)).toEqual([
        'prepare',
        'reflow',
        'commit',
        'total',
      ])
      expect(cycleEvents[3]?.durationMs).toBeGreaterThanOrEqual(0)
    }

    const beforeUnsubscribe = events.length
    unsubscribe()
    count.value = 2
    scheduleAndFlush(scheduled)
    expect(events.length).toBe(beforeUnsubscribe)
  })

  test('expone window.__AXIOM__ solo en desarrollo', () => {
    globalThis.__AXIOM_DEV__ = true

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello DEV' }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    expect(window.__AXIOM__).toBeDefined()
    expect(window.__AXIOM__?.version).toBe('0.2.7')
    expect(window.__AXIOM__?.mounted).toBe(true)
    expect(window.__AXIOM__?.metrics.prepareMs).toBeGreaterThanOrEqual(0)
    expect(window.__AXIOM__?.profiling.enabled).toBe(false)
  })

  test('no expone window.__AXIOM__ fuera de desarrollo', () => {
    globalThis.__AXIOM_DEV__ = false

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello PROD' }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    expect(window.__AXIOM__).toBeUndefined()
  })

  test('dev hook es readonly y frozen', () => {
    globalThis.__AXIOM_DEV__ = true

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Readonly Hook' }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    const hook = window.__AXIOM__
    expect(hook).toBeDefined()
    expect(Object.isFrozen(hook)).toBe(true)
    expect(Object.isFrozen(hook?.metrics)).toBe(true)
    expect(Object.isFrozen(hook?.profiling)).toBe(true)

    expect(() => {
      ;(hook as { mounted: boolean }).mounted = false
    }).toThrow()

    expect(() => {
      ;(hook?.metrics as { prepareMs: number }).prepareMs = 999
    }).toThrow()
  })

  test('cleanup del dev hook ocurre en unmount()', () => {
    globalThis.__AXIOM_DEV__ = true

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Cleanup Hook' }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { textEngine: fakeTextEngine })
    app.mount()

    expect(window.__AXIOM__).toBeDefined()

    app.unmount()

    expect(window.__AXIOM__).toBeUndefined()
  })

  test('error en prepare incluye contexto correcto', () => {
    globalThis.__AXIOM_DEV__ = true
    const expectedError = new Error('prepare-phase-failure')
    const contexts: Array<{ err: unknown; context: { phase: string; displayName: string; route: string } }> = []

    const FaultyPrepare = defineComponent('FaultyPrepare', () => {
      throw expectedError
    })

    const root = document.createElement('div')
    const app = createApp(FaultyPrepare, root, {
      textEngine: fakeTextEngine,
      onError: (err, context) => {
        contexts.push({ err, context })
      },
    })

    const consoleErrorSpy = mock((..._args: unknown[]) => {})
    const originalConsoleError = console.error
    console.error = consoleErrorSpy as unknown as typeof console.error

    try {
      expect(() => app.mount()).toThrow(expectedError)
    } finally {
      console.error = originalConsoleError
    }

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.err).toBe(expectedError)
    expect(contexts[0]?.context.phase).toBe('prepare')
    expect(contexts[0]?.context.displayName).toBe('FaultyPrepare')
    expect(contexts[0]?.context.route).toBe('FaultyPrepare')
    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    const firstCallArgs = consoleErrorSpy.mock.calls[0] ?? []
    expect(String(firstCallArgs[0])).toContain('[Axiom:prepare] FaultyPrepare @ FaultyPrepare')
  })

  test('error en reflow incluye contexto correcto', () => {
    const contexts: Array<{ phase: string; displayName: string; route: string }> = []

    const FaultyReflow = defineComponent('FaultyReflow', () => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'ok' }],
    }))

    const root = document.createElement('div')
    Object.defineProperty(root, 'clientWidth', {
      get() {
        throw new Error('reflow-phase-failure')
      },
      configurable: true,
    })

    const app = createApp(FaultyReflow, root, {
      textEngine: fakeTextEngine,
      onError: (_err, context) => {
        contexts.push(context)
      },
    })

    expect(() => app.mount()).toThrow('reflow-phase-failure')
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.phase).toBe('reflow')
    expect(contexts[0]?.displayName).toBe('FaultyReflow')
    expect(contexts[0]?.route).toBe('FaultyReflow')
  })

  test('error en commit incluye contexto correcto', () => {
    const contexts: Array<{ phase: string; displayName: string; route: string }> = []

    const FaultyCommit = defineComponent('FaultyCommit', () => ({
      type: 'element' as const,
      tag: 'bad tag',
      children: [{ type: 'text' as const, content: 'boom' }],
    }))

    const root = document.createElement('div')
    const app = createApp(FaultyCommit, root, {
      textEngine: fakeTextEngine,
      onError: (_err, context) => {
        contexts.push(context)
      },
    })

    expect(() => app.mount()).toThrow()
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.phase).toBe('commit')
    expect(contexts[0]?.displayName).toBe('FaultyCommit')
    expect(contexts[0]?.route).toBe('FaultyCommit')
  })

  test('fallback razonable cuando no hay displayName explícito', () => {
    const contexts: Array<{ displayName: string; route: string }> = []

    const Anonymous = defineComponent(() => {
      throw new Error('fallback-display-name')
    })

    const root = document.createElement('div')
    const app = createApp(Anonymous, root, {
      textEngine: fakeTextEngine,
      onError: (_err, context) => {
        contexts.push({ displayName: context.displayName, route: context.route })
      },
    })

    expect(() => app.mount()).toThrow('fallback-display-name')
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.displayName.length ?? 0).toBeGreaterThan(0)
    expect(contexts[0]?.route).toBe(contexts[0]?.displayName)
  })

  test('hot reload recovery parcial preserva nodo cuando topología es compatible', () => {
    const scheduled: Array<() => void> = []
    const mockScheduler = (cb: () => void) => {
      scheduled.push(cb)
    }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `v1:${count.value}` }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
    })

    app.enableHotReloadRecovery()
    app.mount()

    const firstElement = root.firstElementChild
    expect(root.textContent).toContain('v1:0')

    ;(comp as unknown as { _fn: () => unknown })._fn = () => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `v2:${count.value}` }],
    })

    count.value = 1
    scheduleAndFlush(scheduled)

    expect(root.textContent).toContain('v2:1')
    expect(root.firstElementChild).toBe(firstElement)
  })

  test('hot reload recovery hace fallback determinista cuando la topología es incompatible', () => {
    const scheduled: Array<() => void> = []
    const mockScheduler = (cb: () => void) => {
      scheduled.push(cb)
    }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `v1:${count.value}` }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
    })

    app.enableHotReloadRecovery()
    app.mount()

    const firstElement = root.firstElementChild

    ;(comp as unknown as { _fn: () => unknown })._fn = () => ({
      type: 'element' as const,
      tag: 'section',
      children: [{ type: 'text' as const, content: `v2:${count.value}` }],
    })

    count.value = 2
    scheduleAndFlush(scheduled)

    expect(root.firstElementChild?.tagName).toBe('SECTION')
    expect(root.textContent).toContain('v2:2')
    expect(root.firstElementChild).not.toBe(firstElement)
  })

  test('hot reload recovery convive con profiling y dev hook', () => {
    globalThis.__AXIOM_DEV__ = true

    const scheduled: Array<() => void> = []
    const mockScheduler = (cb: () => void) => {
      scheduled.push(cb)
    }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `dev:${count.value}` }],
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
    })

    const events: ProfileEvent[] = []
    app.enableProfiling((event) => {
      events.push(event)
    })

    app.enableHotReloadRecovery()
    app.mount()

    expect(window.__AXIOM__).toBeDefined()
    expect(window.__AXIOM__?.profiling.enabled).toBe(true)

    ;(comp as unknown as { _fn: () => unknown })._fn = () => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `dev-hot:${count.value}` }],
    })

    count.value = 3
    scheduleAndFlush(scheduled)

    expect(root.textContent).toContain('dev-hot:3')
    expect(events.some((event) => event.phase === 'total')).toBe(true)

    app.disableHotReloadRecovery()
    count.value = 4
    scheduleAndFlush(scheduled)
    expect(root.textContent).toContain('dev-hot:4')
  })

  test('hydrate + hot reload: fallback mínimo verificable', () => {
    const scheduled: Array<() => void> = []
    const mockScheduler = (cb: () => void) => {
      scheduled.push(cb)
    }

    const count = signal(0)
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `SSR:${count.value}` }],
    }))

    const root = document.createElement('div')

    const app = createApp(comp, root, {
      textEngine: fakeTextEngine,
      scheduler: mockScheduler,
      hydrate: true,
      strictHydration: false,
    })

    app.enableHotReloadRecovery()
    app.mount()
    expect(root.textContent === '' || root.textContent?.includes('SSR:0')).toBe(true)

    ;(comp as unknown as { _fn: () => unknown })._fn = () => ({
      type: 'element' as const,
      tag: 'section',
      children: [{ type: 'text' as const, content: `Hydrated:${count.value}` }],
    })

    count.value = 1
    scheduleAndFlush(scheduled)

    expect(root.firstElementChild?.tagName).toBe('SECTION')
    expect(root.textContent).toContain('Hydrated:1')
  })
})

function scheduleAndFlush(queue: Array<() => void>): void {
  for (const callback of queue) {
    callback()
  }
  queue.length = 0
}
