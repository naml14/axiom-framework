/**
 * Behavioral enforcement for the S4 invariant (`prepare -> reflow -> commit`
 * with a hot path free of DOM reads) at the app level (C-4 / M-12).
 *
 * The static scan (`hot-path-dom-reads.test.ts`) proves `src/app.ts` only
 * contains allowlist-marked DOM reads. This test proves the marker is
 * TRUTHFUL: after mount, signal-driven updates perform zero DOM reads;
 * the cached layout constraints are refreshed only on window `resize`.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Window } from 'happy-dom'
import { createApp, defineComponent, signal } from '../../src/index.js'
import type { App } from '../../src/index.js'
// Internal import — resetScheduler is not public API but is required to make
// the reactive test deterministic (same pattern as tests/app.test.ts).
import { resetScheduler } from '../../src/scheduler.js'

// ============================================================
// happy-dom setup (mirrors tests/app.test.ts)
// ============================================================

let win: Window
let windowInterceptionSupported = false

function setupDOM(): Window {
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

// ============================================================
// Counting proxies for the layout-constraint DOM reads
// ============================================================

const counters = {
  clientWidth: 0,
  clientHeight: 0,
  innerWidth: 0,
  innerHeight: 0,
}

function resetCounters(): void {
  counters.clientWidth = 0
  counters.clientHeight = 0
  counters.innerWidth = 0
  counters.innerHeight = 0
}

function installRootCounters(root: HTMLElement): void {
  Object.defineProperty(root, 'clientWidth', {
    configurable: true,
    get(): number {
      counters.clientWidth++
      return 400
    },
  })
  Object.defineProperty(root, 'clientHeight', {
    configurable: true,
    get(): number {
      counters.clientHeight++
      return 300
    },
  })
}

function installWindowCounters(window: Window): void {
  windowInterceptionSupported = true
  try {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get(): number {
        counters.innerWidth++
        return 1024
      },
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      get(): number {
        counters.innerHeight++
        return 768
      },
    })
  } catch {
    windowInterceptionSupported = false
  }
}

// ============================================================
// Fake text layout engine (mirrors tests/app.test.ts)
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

// Synchronous scheduler: a signal write triggers the update inline.
const syncScheduler = (cb: () => void): void => {
  cb()
}

function createCountingApp(): { app: App; count: ReturnType<typeof signal<number>>; root: HTMLElement } {
  const count = signal(0)
  const comp = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: [{ type: 'text' as const, content: `Count: ${count.value}` }],
  }))
  const root = document.createElement('div')
  installRootCounters(root)
  const app = createApp(comp, root, { textEngine: fakeTextEngine, scheduler: syncScheduler })
  return { app, count, root }
}

beforeEach(() => {
  win = setupDOM()
  installWindowCounters(win)
  resetScheduler()
  resetCounters()
})

afterEach(() => {
  resetScheduler()
})

describe('app steady state performs zero DOM reads (C-4/M-12, S4)', () => {
  for (const source of ['window', 'root'] as const) {
    test(`${source} resize schedules layout without a signal update and disconnects on unmount`, () => {
      let notify: ResizeObserverCallback | undefined
      let disconnected = false
      const Original = win.ResizeObserver
      Object.defineProperty(win, 'ResizeObserver', { configurable: true, value: class {
        constructor(callback: ResizeObserverCallback) { notify = callback }
        observe() {}
        unobserve() {}
        disconnect() { disconnected = true }
      } })
      const root = document.createElement('div')
      let width = 400
      Object.defineProperty(root, 'clientWidth', { get: () => width })
      const comp = defineComponent(() => ({ type: 'element' as const, tag: 'div', children: [] }))
      const app = createApp(comp, root, { scheduler: syncScheduler })
      try {
        app.mount()
        expect((root.firstElementChild as HTMLElement).style.width).toBe('400px')
        width = 250
        if (source === 'window') win.dispatchEvent(new win.Event('resize'))
        else {
          expect(notify).toBeDefined()
          notify!([], {} as ResizeObserver)
        }
        expect((root.firstElementChild as HTMLElement).style.width).toBe('250px')
        app.unmount()
        expect(disconnected).toBe(true)
      } finally { Object.defineProperty(win, 'ResizeObserver', { configurable: true, value: Original }) }
    })
  }

  test('mount reads layout constraints exactly from the DOM', () => {
    const { app, root } = createCountingApp()
    resetCounters()
    app.mount()

    // Mount is the legitimate read point: constraints are read and cached.
    expect(counters.clientWidth).toBeGreaterThan(0)
    expect(counters.clientHeight).toBeGreaterThan(0)
    if (windowInterceptionSupported) {
      expect(counters.innerWidth).toBeGreaterThan(0)
      expect(counters.innerHeight).toBeGreaterThan(0)
    }
    expect(root.textContent).toContain('Count: 0')
    app.unmount()
  })

  test('signal-driven updates after mount perform zero DOM reads', () => {
    const { app, count, root } = createCountingApp()
    app.mount()

    resetCounters()
    count.value = 1
    count.value = 2
    count.value = 3

    // Updates ran (DOM text changed) but no constraint DOM read happened:
    // steady-state cycles consume the cached layout constraints.
    expect(root.textContent).toContain('Count: 3')
    expect(counters.clientWidth).toBe(0)
    expect(counters.clientHeight).toBe(0)
    expect(counters.innerWidth).toBe(0)
    expect(counters.innerHeight).toBe(0)
    app.unmount()
  })

  test('window resize refreshes the cached constraints', () => {
    const { app, count, root } = createCountingApp()
    app.mount()

    resetCounters()
    win.dispatchEvent(new win.Event('resize'))

    expect(counters.clientWidth).toBeGreaterThan(0)
    expect(counters.clientHeight).toBeGreaterThan(0)
    if (windowInterceptionSupported) {
      expect(counters.innerWidth).toBeGreaterThan(0)
      expect(counters.innerHeight).toBeGreaterThan(0)
    }

    // The refreshed constraints feed the next update cycle without new reads.
    resetCounters()
    count.value = 9
    expect(root.textContent).toContain('Count: 9')
    expect(counters.clientWidth).toBe(0)
    expect(counters.clientHeight).toBe(0)
    app.unmount()
  })

  test('unmount removes the resize listener (no reads after teardown)', () => {
    const { app } = createCountingApp()
    app.mount()
    app.unmount()

    resetCounters()
    win.dispatchEvent(new win.Event('resize'))

    expect(counters.clientWidth).toBe(0)
    expect(counters.clientHeight).toBe(0)
    expect(counters.innerWidth).toBe(0)
    expect(counters.innerHeight).toBe(0)
  })
})
