import { describe, test, expect, mock } from 'bun:test'
// Public API imports only — validates that the integration tests work
// against the same surface that consumers see
import { signal, computed, effect, defineComponent, prepare } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

// ============================================================
// Fake text layout engine
// ============================================================

const fakeTextEngine = {
  prepare: mock((text: string, _font: string) => ({ text })),
  layout: mock((_p: unknown, _w: number, lh: number) => ({ lineCount: 1, height: lh })),
  clearCache: mock(),
}

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
