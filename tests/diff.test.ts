import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { fastDiff, fullDiff, type DOMOperation } from '../src/render/diff.js'
import { createLayoutResult } from '../src/render/reflow.js'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'

// Setup happy-dom for tests that need DOM
let win: ReturnType<typeof setupDOM>

function setupDOM() {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
  return window
}

beforeAll(() => {
  win = setupDOM()
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
// fastDiff tests
// ============================================================

describe('fastDiff', () => {
  test('returns empty array when no changes', () => {
    const layout = createLayoutResultFor(3)
    const changed = fastDiff(layout, layout)
    expect(changed).toEqual([])
  })

  test('detects position changes', () => {
    const prev = createLayoutResultFor(2)
    const next = createLayoutResultFor(2)
    next.x[1] = 100
    next.y[1] = 50

    const changed = fastDiff(prev, next)
    expect(changed).toContain(1)
    expect(changed).not.toContain(0)
  })

  test('detects size changes', () => {
    const prev = createLayoutResultFor(2)
    const next = createLayoutResultFor(2)
    next.width[1] = 200
    next.height[1] = 100

    const changed = fastDiff(prev, next)
    expect(changed).toContain(1)
  })

  test('detects multiple changes', () => {
    const prev = createLayoutResultFor(3)
    const next = createLayoutResultFor(3)
    next.x[0] = 10
    next.width[2] = 300

    const changed = fastDiff(prev, next)
    expect(changed).toContain(0)
    expect(changed).toContain(2)
    expect(changed.length).toBe(2)
  })
})

// ============================================================
// fullDiff tests
// ============================================================

describe('fullDiff', () => {
  test('first render generates all inserts', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const layout = createLayoutResult(prepared)

    const ops = fullDiff(null, null, prepared, layout, [])
    expect(ops.length).toBe(2) // root + text
    expect(ops.every(op => op.type === 'insert')).toBe(true)
  })

  test('value change generates updates only', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))
    const prevPrepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    prevLayout.x[1] = 0
    prevLayout.y[1] = 0
    prevLayout.width[1] = 500
    prevLayout.height[1] = 20

    const newPrepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const newLayout = createLayoutResult(newPrepared)
    newLayout.x[1] = 100
    newLayout.y[1] = 50

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createTextNode('Hello'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    expect(ops.every(op => op.type === 'update')).toBe(true)
  })

  test('shape change generates removes and inserts', () => {
    const comp1 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'A' },
        { type: 'text' as const, content: 'B' }
      ]
    }))
    const comp2 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'A' }
      ]
    }))

    const prevPrepared = prepare(comp1, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newPrepared = prepare(comp2, undefined, { textEngine: fakeTextEngine })
    const newLayout = createLayoutResult(newPrepared)

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createTextNode('A'),
      document.createTextNode('B'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    const removes = ops.filter(op => op.type === 'remove')
    expect(removes.length).toBeGreaterThan(0)
  })

  test('operations are ordered: removes → updates → inserts', () => {
    const comp1 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'A' },
        { type: 'text' as const, content: 'B' }
      ]
    }))
    const comp2 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'A' },
        { type: 'text' as const, content: 'C' }
      ]
    }))

    const prevPrepared = prepare(comp1, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newPrepared = prepare(comp2, undefined, { textEngine: fakeTextEngine })
    const newLayout = createLayoutResult(newPrepared)

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createTextNode('A'),
      document.createTextNode('B'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    const types = ops.map(op => op.type)

    const lastRemove = types.lastIndexOf('remove')
    const firstUpdate = types.indexOf('update')
    const firstInsert = types.indexOf('insert')

    if (lastRemove >= 0 && firstUpdate >= 0) {
      expect(lastRemove).toBeLessThan(firstUpdate)
    }
    if (firstUpdate >= 0 && firstInsert >= 0) {
      expect(firstUpdate).toBeLessThan(firstInsert)
    }
  })

  test('key-based reconciliation reuses DOM nodes', () => {
    const comp1 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'element' as const, tag: 'span', key: 'a', children: [{ type: 'text' as const, content: 'A' }] },
        { type: 'element' as const, tag: 'span', key: 'b', children: [{ type: 'text' as const, content: 'B' }] }
      ]
    }))
    const comp2 = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'element' as const, tag: 'span', key: 'b', children: [{ type: 'text' as const, content: 'B' }] },
        { type: 'element' as const, tag: 'span', key: 'a', children: [{ type: 'text' as const, content: 'A' }] }
      ]
    }))

    const prevPrepared = prepare(comp1, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newPrepared = prepare(comp2, undefined, { textEngine: fakeTextEngine })
    const newLayout = createLayoutResult(newPrepared)

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createElement('span'), // key 'a'
      document.createTextNode('A'),
      document.createElement('span'), // key 'b'
      document.createTextNode('B'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    // With key reconciliation, reordered elements should be moves/updates, not remove+insert
    const inserts = ops.filter(op => op.type === 'insert')
    const removes = ops.filter(op => op.type === 'remove')
    // Key reconciliation should minimize removes/inserts
    expect(inserts.length + removes.length).toBeLessThan(4)
  })

  test('same-shape fast path incluye cambios de style en update ops', () => {
    const compA = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'span',
          style: { color: 'red' as const },
          children: [{ type: 'text' as const, content: 'A' }],
        },
      ],
    }))

    const compB = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'span',
          style: { color: 'blue' as const },
          children: [{ type: 'text' as const, content: 'A' }],
        },
      ],
    }))

    const prevPrepared = prepare(compA, undefined, { textEngine: fakeTextEngine })
    const newPrepared = prepare(compB, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newLayout = createLayoutResult(newPrepared)

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createElement('span'),
      document.createTextNode('A'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    const styleUpdate = ops.find((op) => op.type === 'update' && op.index === 1)
    expect(styleUpdate).toBeDefined()
    expect(styleUpdate && 'newStyle' in styleUpdate).toBe(true)
    if (styleUpdate && styleUpdate.type === 'update') {
      expect(styleUpdate.newStyle?.color).toBe('blue')
    }
  })

  test('same-shape fast path no duplica update cuando layout y texto cambian en el mismo índice', () => {
    const compA = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'A' }],
    }))

    const compB = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'B' }],
    }))

    const prevPrepared = prepare(compA, undefined, { textEngine: fakeTextEngine })
    const newPrepared = prepare(compB, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newLayout = createLayoutResult(newPrepared)

    // Mismo índice (1) tiene cambio de layout + texto
    newLayout.x[1] = 42

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createTextNode('A'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    const updatesTextNode = ops.filter((op) => op.type === 'update' && op.index === 1)

    expect(updatesTextNode.length).toBe(1)
    if (updatesTextNode[0]?.type === 'update') {
      expect(updatesTextNode[0].newTextContent).toBe('B')
    }
  })

  test('same-shape fast path marca eliminación de style (newStyle undefined)', () => {
    const compA = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'span',
          style: { color: 'red' as const },
          children: [{ type: 'text' as const, content: 'A' }],
        },
      ],
    }))

    const compB = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'span',
          children: [{ type: 'text' as const, content: 'A' }],
        },
      ],
    }))

    const prevPrepared = prepare(compA, undefined, { textEngine: fakeTextEngine })
    const newPrepared = prepare(compB, undefined, { textEngine: fakeTextEngine })
    const prevLayout = createLayoutResult(prevPrepared)
    const newLayout = createLayoutResult(newPrepared)

    const domNodes: (HTMLElement | Text | null)[] = [
      document.createElement('div'),
      document.createElement('span'),
      document.createTextNode('A'),
    ]

    const ops = fullDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
    const styleUpdate = ops.find((op) => op.type === 'update' && op.index === 1)
    expect(styleUpdate).toBeDefined()
    expect(styleUpdate && 'newStyle' in styleUpdate).toBe(true)
    if (styleUpdate && styleUpdate.type === 'update') {
      expect(styleUpdate.newStyle).toBeUndefined()
    }
  })
})

// ============================================================
// Helpers
// ============================================================

function createLayoutResultFor(count: number) {
  return {
    x: new Float32Array(count),
    y: new Float32Array(count),
    width: new Float32Array(count),
    height: new Float32Array(count),
    nodeCount: count,
  }
}
