import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { defineComponent } from '../src/component.js'
import { prepare, resetIndexCounter } from '../src/prepare.js'
import { reflow, createLayoutResult } from '../src/reflow.js'
import type { PreparedComponent } from '../src/types.js'

// ============================================================
// Fake pretext
// ============================================================

const fakePretext = {
  prepare: mock((text: string, _font: string) => ({ text })),
  layout: mock((_prepared: unknown, maxWidth: number, _lineHeight: number) => {
    // Simulate text wrapping: ~6px per character at 16px font
    const charWidth = 6
    const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth))
    const totalChars = (_prepared as { text: string }).text.length
    const lineCount = Math.max(1, Math.ceil(totalChars / charsPerLine))
    return { lineCount, height: lineCount * 20 } // 20px line height
  }),
  clearCache: mock(),
}

const DEFAULT_LINE_HEIGHT = 20

// ============================================================
// Helpers
// ============================================================

function prepareSimple(content: string) {
  const comp = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: [{ type: 'text' as const, content }]
  }))
  return prepare(comp, undefined, { pretext: fakePretext })
}

describe('createLayoutResult', () => {
  test('allocates Float32Arrays of correct size', () => {
    const prepared = prepareSimple('Hello')
    const result = createLayoutResult(prepared)

    expect(result.nodeCount).toBe(2) // root element + text node
    expect(result.x.length).toBe(2)
    expect(result.y.length).toBe(2)
    expect(result.width.length).toBe(2)
    expect(result.height.length).toBe(2)
  })

  test('allocates for deeply nested tree', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'element' as const, tag: 'div', children: [
          { type: 'text' as const, content: 'deep' }
        ]}
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = createLayoutResult(prepared)

    expect(result.nodeCount).toBe(3) // root + child + text
  })
})

describe('reflow — fast path', () => {
  test('positions text child at origin', () => {
    const prepared = prepareSimple('Hello')
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Root element fills constraint width
    expect(result.width[0]).toBe(500)
    // Text child at x=0, y=0
    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.width[1]).toBe(500) // fills parent
  })

  test('calculates text height based on content', () => {
    const prepared = prepareSimple('Hello')
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // "Hello" = 5 chars, at 6px/char = 30px wide, fits in one line
    expect(result.height[1]).toBe(20) // 1 line * 20px
  })

  test('wraps text when maxWidth is small', () => {
    const prepared = prepareSimple('Hello World') // 11 chars
    const result = reflow(prepared, { maxWidth: 30, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // 30px / 6px per char = 5 chars per line → 11 chars = 3 lines
    expect(result.height[1]).toBe(60) // 3 lines * 20px
  })

  test('stacks multiple children vertically', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Line 1' },
        { type: 'text' as const, content: 'Line 2' }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // First child at y=0
    expect(result.y[1]).toBe(0)
    // Second child at y=height of first
    expect(result.y[2]).toBe(result.height[1])
  })

  test('parent height equals sum of children heights', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'A' },
        { type: 'text' as const, content: 'B' }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[0]).toBe(result.height[1] + result.height[2])
  })

  test('handles empty children', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: []
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[0]).toBe(500)
    expect(result.height[0]).toBe(0)
  })
})

describe('reflow — flex layout', () => {
  test('row layout positions children horizontally', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row' },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // First child at x=0
    expect(result.x[1]).toBe(0)
    // Second child at x=100
    expect(result.x[2]).toBe(100)
    // Both at y=0
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(0)
  })

  test('row layout with gap', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row', gap: 10 },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.x[2]).toBe(110) // 100 + 10 gap
  })

  test('justifyContent: center in column', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'column', height: 200, justifyContent: 'center' },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Free space = 200 - 50 = 150, center = 75
    expect(result.y[1]).toBe(75)
  })

  test('justifyContent: space-between', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'column', height: 200, justifyContent: 'space-between' },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // First at top, last at bottom
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(150) // 200 - 50
  })

  test('alignItems: center in row', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row', alignItems: 'center', height: 100 },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 50, height: 40 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Cross axis center: (100 - 40) / 2 = 30
    expect(result.y[1]).toBe(30)
  })

  test('padding reduces available space for children', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { padding: 20 },
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Child positioned at x=20, y=20 (padding offset)
    expect(result.x[1]).toBe(20)
    expect(result.y[1]).toBe(20)
    // Child width = parent - 2*padding
    expect(result.width[1]).toBe(460) // 500 - 40
  })
})

describe('reflow — edge cases', () => {
  test('empty tree returns zero dimensions', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: []
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 0, maxHeight: 0 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[0]).toBe(0)
    expect(result.height[0]).toBe(0)
  })

  test('zero constraint bounds children to zero', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))
    const prepared = prepare(comp, undefined, { pretext: fakePretext })
    const result = reflow(prepared, { maxWidth: 0, maxHeight: 0 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[0]).toBe(0)
  })

  test('no NaN values in result', () => {
    const prepared = prepareSimple('Hello')
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    for (let i = 0; i < result.nodeCount; i++) {
      expect(Number.isNaN(result.x[i])).toBe(false)
      expect(Number.isNaN(result.y[i])).toBe(false)
      expect(Number.isNaN(result.width[i])).toBe(false)
      expect(Number.isNaN(result.height[i])).toBe(false)
    }
  })
})
