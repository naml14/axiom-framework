import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
// Public API imports — these are the only things consumers can use
import { createApp, defineComponent, signal } from '../src/index.js'
import type { App } from '../src/index.js'
// Internal import — resetScheduler is not public API but is required to make
// the reactive test deterministic (controls rAF scheduling in test environment)
import { resetScheduler } from '../src/scheduler.js'

// Setup happy-dom
let win: ReturnType<typeof setupDOM>

function setupDOM() {
  const window = new Window()
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

// ============================================================
// Fake pretext
// ============================================================

const fakePretext = {
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
    const app = createApp(comp, root, { pretext: fakePretext })

    expect(typeof app.mount).toBe('function')
    expect(typeof app.unmount).toBe('function')
    expect(typeof app.getMetrics).toBe('function')
  })

  test('mount() creates DOM synchronously', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      classes: ['app'],
      children: [{ type: 'text' as const, content: 'Hello World' }]
    }))

    const root = document.createElement('div')
    const app = createApp(comp, root, { pretext: fakePretext })
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
    const app = createApp(comp, root, { pretext: fakePretext })
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
    const app = createApp(comp, root, { pretext: fakePretext })
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
      pretext: fakePretext,
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
})
