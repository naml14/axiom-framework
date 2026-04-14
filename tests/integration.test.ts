import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { Window } from 'happy-dom'
// Public API imports only — validates that the integration tests work
// against the same surface that consumers see
import {
  signal,
  computed,
  effect,
  defineComponent,
  prepare,
  createApp,
  renderToString,
} from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

// ============================================================
// Fake text layout engine
// ============================================================

const fakeTextEngine = {
  prepare: mock((text: string, _font: string) => ({ text })),
  layout: mock((_p: unknown, _w: number, lh: number) => ({ lineCount: 1, height: lh })),
  clearCache: mock(),
}

function setupDOM(html?: string): Window {
  const window = new Window()
  globalThis.window = window as unknown as typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
  globalThis.requestAnimationFrame = ((cb: () => void) => {
    cb()
    return 0
  }) as typeof requestAnimationFrame
  if (html !== undefined) {
    window.document.write(html)
  }
  return window
}

beforeEach(() => {
  setupDOM()
})

// ============================================================
// Integration: Signal → Effect → Prepare
// ============================================================

describe('integration: signal triggers prepare', () => {
  test('effect re-executes prepare when signal changes', () => {
    const count = signal(0)
    let preparedCount = 0

    const comp = defineComponent((props: { value: number }) => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `Count: ${props.value}` }]
    }))

    effect(() => {
      const p = prepare(comp, { value: count.value }, { textEngine: fakeTextEngine })
      preparedCount++
      expect(p).toBeDefined()
    })

    expect(preparedCount).toBe(1)
    count.value = 5
    expect(preparedCount).toBe(2)
  })

  test('signal-derived text content updates in prepare', () => {
    const name = signal('World')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `Hello ${name.value}!` }]
    }))

    const p1 = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(p1).toBeDefined()

    name.value = 'Axiom'
    const p2 = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(p2).toBeDefined()
  })

  test('signal-derived children list updates in prepare', () => {
    const items = signal(['a', 'b'])

    const comp = defineComponent(() => ({
      type: 'fragment' as const,
      children: items.value.map(item => ({
        type: 'text' as const,
        content: item
      }))
    }))

    const p1 = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(p1).toBeDefined()

    items.value = ['a', 'b', 'c']
    const p2 = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(p2).toBeDefined()
  })

  test('computed signal in component props', () => {
    const base = signal(10)
    const doubled = computed(() => base.value * 2)

    const comp = defineComponent((props: { value: number }) => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `Doubled: ${props.value}` }]
    }))

    let lastValue = 0
    effect(() => {
      const p = prepare(comp, { value: doubled.value }, { textEngine: fakeTextEngine })
      expect(p).toBeDefined()
      lastValue = doubled.value
    })

    expect(lastValue).toBe(20)
    base.value = 50
    expect(lastValue).toBe(100)
  })

  test('full reactive cycle: signal → computed → effect → prepare', () => {
    const items = signal<string[]>(['hello'])
    const count = computed(() => items.value.length)

    const List = defineComponent(() => ({
      type: 'element' as const,
      tag: 'ul',
      children: items.value.map(item => ({
        type: 'element' as const,
        tag: 'li',
        children: [{ type: 'text' as const, content: item }]
      }))
    }))

    let prepareCalls = 0
    effect(() => {
      void count.value // track computed
      const p = prepare(List, undefined, { textEngine: fakeTextEngine })
      prepareCalls++
      expect(p).toBeDefined()
    })

    expect(prepareCalls).toBe(1)
    items.value = ['hello', 'world']
    expect(prepareCalls).toBe(2)
  })
})

describe('integration: SSR -> hydrate -> interaction', () => {
  test('hidrata HTML SSR, reusa nodo y mantiene interacción reactiva', () => {
    const count = signal(0)

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'button',
          on: {
            click: () => {
              count.value = count.value + 1
            },
          },
          children: [{ type: 'text' as const, content: `Count: ${count.value}` }],
        },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    setupDOM(html)

    const root = document.getElementById('app') as HTMLElement | null
    expect(root).not.toBeNull()

    const before = root?.getElementsByTagName('button')[0] ?? null
    expect(before).not.toBeNull()
    expect(before?.textContent).toContain('Count: 0')

    const app = createApp(App, root!, {
      textEngine: fakeTextEngine,
      hydrate: true,
      strictHydration: true,
      scheduler: (cb) => cb(),
    })

    app.mount()

    const hydratedButton = root?.getElementsByTagName('button')[0] ?? null
    expect(hydratedButton).toBe(before)

    hydratedButton?.dispatchEvent(new window.Event('click'))
    expect((root?.getElementsByTagName('button')[0] ?? null)?.textContent).toContain('Count: 1')
  })
})
