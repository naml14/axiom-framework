import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow, createLayoutResult } from '../src/render/reflow.js'
import type { PreparedComponent } from '../src/core/types.js'
import { measureTextChild } from '../src/render/engines/text-measure.js'
import type { FontData } from '../src/render/engines/text-measure.js'

// ============================================================
// Fake text layout engine
// ============================================================

const fakeTextEngine = {
  prepare: mock((text: string, _font: string) => ({ text })),
  layout: mock((_prepared: unknown, maxWidth: number, _lineHeight: number) => {
    // Simulate text wrapping — used by prepare() for metrics, not by fast-path measureText
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
  return prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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

    // Fast-path uses charWidth=8 with 1.4x word-wrap factor.
    // 30/8 = 3 chars/line, 11 chars → ceil((11/3)*1.4) = 6 lines → 120px
    expect(result.height[1]).toBe(120)
    // Key invariant: constrained width produces taller text than wide width
    const wideResult = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })
    expect(result.height[1]).toBeGreaterThan(wideResult.height[1] ?? 0)
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[0]).toBe((result.height[1] ?? 0) + (result.height[2] ?? 0))
  })

  test('handles empty children', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: []
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Cross axis center: (100 - 40) / 2 = 30
    expect(result.y[1]).toBe(30)
  })

  test('justifyContent: space-around distributes items with half-size edge gaps', () => {
    // 2 items of height 50 in a column container of height 200
    // freeSpace = 200 - (50+50) = 100, space-around: each item gets 25 on each side
    // item[0].y = 25, item[1].y = 25 + 50 + 50 = 125
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'column', height: 200, justifyContent: 'space-around' },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
      ]
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.y[1]).toBe(25)   // first item: edge gap = freeSpace/(2*n) = 100/4 = 25
    expect(result.y[2]).toBe(125)  // second item: 25 + 50 + 50 = 125
  })

  test('justifyContent: space-around with three items', () => {
    // 3 items of height 30 in column of height 210 → total items = 90, free = 120
    // space-around: each item gets 120/3 = 40 total, so 20 on each side
    // item[0].y = 20, item[1].y = 20+30+40 = 90, item[2].y = 90+30+40 = 160
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'column', height: 210, justifyContent: 'space-around' },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 50, height: 30 } },
        { type: 'element' as const, tag: 'div', layout: { width: 50, height: 30 } },
        { type: 'element' as const, tag: 'div', layout: { width: 50, height: 30 } },
      ]
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.y[1]).toBe(20)
    expect(result.y[2]).toBe(90)
    expect(result.y[3]).toBe(160)
  })

  test('alignItems: baseline behaves like center in row', () => {
    // baseline ≈ center per design decision
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row', alignItems: 'baseline', height: 100 },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 50, height: 40 } }
      ]
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Same as center: (100 - 40) / 2 = 30
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
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

describe('reflow — grid layout MVP', () => {
  test('explicit placement básico ubica child en celda objetivo (1-based)', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // col width = 100
    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(10)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(0)
  })

  test('mixed explicit + auto-placement respeta celdas ocupadas', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Child explícito fija (row1,col2)
    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(0)

    // Auto-placement llena first-free row-major: (row1,col1) luego (row2,col1)
    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
  })

  test('conflicto explícito es determinista: gana primero, resto va a auto-placement', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // 1ro explícito conserva target
    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    // 2do en conflicto pasa a auto-placement (first free: row1,col2)
    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    // 3ro auto ocupa siguiente first free (row2,col1)
    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
  })

  test('row-only placement busca primera columna libre en esa fila', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 3 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 3, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 300, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(200)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(10)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
  })

  test('column-only placement busca primera fila libre en esa columna', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(10)
  })

  test('partial explicit coexiste con explícitos completos y auto-placement', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(10)

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(10)
  })

  test('valores parciales inválidos hacen fallback a auto-placement normal', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 0 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: Number.NaN } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: Number.POSITIVE_INFINITY } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)

    expect(result.x[4]).toBe(100)
    expect(result.y[4]).toBe(10)
  })

  test('auto-placement row-major en múltiples columnas', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)

    expect(result.x[4]).toBe(100)
    expect(result.y[4]).toBe(10)
  })

  test('aplica columnGap y rowGap', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
        rowGap: 5,
      } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // col width = (210 - 10) / 2 = 100
    expect(result.x[1]).toBe(0)
    expect(result.x[2]).toBe(110)

    // y segunda fila = 10 + rowGap(5)
    expect(result.y[3]).toBe(15)
    expect(result.y[4]).toBe(15)
  })

  test('usa gap como shorthand cuando rowGap/columnGap no están definidos', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        gap: 10,
      } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // col width = (210 - 10) / 2 = 100
    expect(result.x[1]).toBe(0)
    expect(result.x[2]).toBe(110)

    // y segunda fila = 10 + gap(10)
    expect(result.y[3]).toBe(20)
    expect(result.y[4]).toBe(20)
  })

  test('explicit span across 2 columns reserva rectángulo y expande ancho efectivo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 3 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: 10, gridColumn: 1, gridRow: 1, gridColumnSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 300, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.width[1]).toBe(200)

    expect(result.x[2]).toBe(200)
    expect(result.y[2]).toBe(0)
  })

  test('span across 2 columns incluye columnGap cruzado en el ancho efectivo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: 10, gridColumn: 1, gridRow: 1, gridColumnSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.width[1]).toBeGreaterThan(100)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(10)
  })

  test('texto dentro de item spanned se mide usando el ancho spanned efectivo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { gridColumnSpan: 2 } as any,
          children: [
            { type: 'text' as const, content: '123456789012345678901234567890' },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.width[2]).toBe(210)
    expect(result.height[2]).toBe(40)
    expect(result.height[1]).toBe(40)
  })

  test('item spanned con width 100% propaga el ancho efectivo a un flex row anidado con gap', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { gridColumnSpan: 2, width: '100%' } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: {
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
              } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { width: 50, height: 20 } },
                { type: 'element' as const, tag: 'div', layout: { width: 50, height: 20 } },
              ],
            },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.width[2]).toBe(210)
    expect(result.x[3]).toBe(50)
    expect(result.x[4]).toBe(110)
  })

  test('padding de item spanned reduce el inner width desde el ancho spanned efectivo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { gridColumnSpan: 2, width: '100%', padding: 20 } as any,
          children: [
            { type: 'text' as const, content: '123456789012345678901234567890' },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.x[2]).toBe(20)
    expect(result.width[2]).toBe(170)
    expect(result.height[2]).toBe(40)
    expect(result.height[1]).toBe(80)
  })

  test('nested grid child dentro de item spanned mide sus columnas contra el ancho spanned efectivo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 2,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { gridColumnSpan: 2, width: '100%' } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: { display: 'grid', gridTemplateColumns: 2, width: '100%' } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: 10 } },
                { type: 'element' as const, tag: 'div', layout: { height: 10 } },
              ],
            },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 210, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.width[2]).toBe(210)
    expect(result.width[3]).toBe(105)
    expect(result.width[4]).toBe(105)
    expect(result.x[3]).toBe(0)
    expect(result.x[4]).toBe(105)
  })

  test('siblings posteriores respetan celdas ocupadas y altura medida de item spanned anidado', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        display: 'grid',
        gridTemplateColumns: 3,
        columnGap: 10,
      } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { gridColumnSpan: 2, width: '100%', padding: 20 } as any,
          children: [
            { type: 'text' as const, content: '123456789012345678901234567890123456789012345678901234567890' },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 320, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.width[1]).toBe(210)
    expect(result.height[1]).toBe(120)

    expect(result.x[3]).toBe(220)
    expect(result.y[3]).toBe(0)

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(120)
  })

  test('auto-placement con span ocupa múltiples columnas y busca siguiente rectángulo libre', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 3 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumnSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 300, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.width[1]).toBe(200)

    expect(result.x[2]).toBe(200)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
  })

  test('row-span reserva filas futuras y desplaza items posteriores', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: 20, gridColumn: 1, gridRow: 1, gridRowSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(10)

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(20)
  })

  test('span combinado reserva rectángulo completo para placements posteriores', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 3 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: {
            height: 20,
            gridColumn: 1,
            gridRow: 1,
            gridColumnSpan: 2,
            gridRowSpan: 2,
          } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 300, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.width[1]).toBe(200)

    expect(result.x[2]).toBe(200)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(200)
    expect(result.y[3]).toBe(10)

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(20)
  })

  test('spans inválidos hacen fallback determinista a span=1 y auto-placement normal', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: {
            height: 10,
            gridColumn: 1,
            gridRow: 1,
            gridColumnSpan: 0,
            gridRowSpan: Number.POSITIVE_INFINITY,
          } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumnSpan: Number.NaN } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.width[1]).toBe(100)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
    expect(result.width[3]).toBe(100)
  })

  test('row-only + gridColumnSpan busca primer rectángulo que sí cabe dentro de la fila pedida', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 4 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 1, gridColumnSpan: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 400, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(200)
    expect(result.y[3]).toBe(0)
    expect(result.width[3]).toBe(200)
  })

  test('gridColumn only + gridRowSpan busca primera fila donde el rectángulo completo cabe en esa columna', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 20, gridColumn: 2, gridRowSpan: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(100)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(10)

    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(20)
  })

  test('partial fallback a auto-placement global conserva orden fuente frente a autos posteriores', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 1, gridColumnSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(10)
    expect(result.width[2]).toBe(200)

    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(0)

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(20)
  })

  test('colisiones entre explícito completo, parcial y auto-placement mantienen regla determinista', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 3 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridRow: 1, gridColumnSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 3, gridRow: 1 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 300, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(10)
    expect(result.width[2]).toBe(200)

    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(0)

    expect(result.x[4]).toBe(200)
    expect(result.y[4]).toBe(0)
  })

  test('gridRowSpan + height 100% usa alto vertical efectivo del span cuando ya es determinable', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // row1 + row2 ya determinadas en 30 + 30
    expect(result.height[3]).toBe(60)
  })

  test('contenido anidado dentro de item row-spanned respeta altura vertical resuelta', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
          children: [
            { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[3]).toBe(60)
    expect(result.height[4]).toBe(60)
  })

  test('items posteriores a filas ocupadas por rowSpan mantienen y-offset consistente', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(60)
  })

  test('fallback determinista: si alto vertical efectivo del span no es determinable, 100% usa maxHeight disponible', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 1, gridRow: 1, gridRowSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Determinista en MVP: base = constraints.maxHeight cuando aún no hay filas resueltas
    expect(result.height[1]).toBe(240)
  })

  test('coexiste con nodos no-grid (flex/simple sigue funcionando)', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { display: 'grid', gridTemplateColumns: 2 } as any,
          children: [
            { type: 'element' as const, tag: 'div', layout: { height: 20 } },
            { type: 'element' as const, tag: 'div', layout: { height: 20 } },
          ],
        },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { flexDirection: 'row', gap: 10 } as any,
          children: [
            { type: 'element' as const, tag: 'div', layout: { width: 50, height: 10 } },
            { type: 'element' as const, tag: 'div', layout: { width: 50, height: 10 } },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Grid child auto-placement
    expect(result.x[2]).toBe(0)
    expect(result.x[3]).toBe(100)

    // Flex child sigue horizontal con gap
    expect(result.x[5]).toBe(0)
    expect(result.x[6]).toBe(60)
  })

  test('auto-placed row-spanned con height 100% normaliza altura en segundo pase cuando filas ya son determinables', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Auto-placement esperado: (row1,col2), span 2 filas => 30 + 30 = 60
    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(0)
    expect(result.height[3]).toBe(60)
  })

  test('items posteriores preservan y-offset estable tras segundo pase de rowSpan auto-placed', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[4]).toBe(0)
    // y estable esperado: fila 3 empieza en 60
    expect(result.y[4]).toBe(60)
  })

  test('row-spanned explícito mantiene semántica previa (usa alto vertical efectivo determinable)', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[3]).toBe(60)
  })

  test('no regresión: grid sin rowSpan conserva offsets y alturas previas', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)

    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    expect(result.x[3]).toBe(0)
    expect(result.y[3]).toBe(10)
    expect(result.height[1]).toBe(10)
    expect(result.height[2]).toBe(10)
    expect(result.height[3]).toBe(10)
  })

  test('auto-placed row-spanned con height 100% re-mide contenido anidado tras normalización vertical de segundo pase', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
          children: [
            { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
          ],
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Span auto-placed esperado en (row1,col2), base vertical determinable = 30 + 30
    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(0)
    expect(result.height[3]).toBe(60)

    // El subárbol anidado debe recibir la nueva restricción de altura final (no 240)
    expect(result.height[4]).toBe(60)
  })

  test('nested flex/grid dentro de auto-placed row-span se re-mide localmente sin alterar y-offset de sibling no afectado', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: { display: 'grid', gridTemplateColumns: 2, width: '100%', height: '100%' } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
              ],
            },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Afectado normalizado y re-medido: 60
    expect(result.height[3]).toBe(60)
    expect(result.height[4]).toBe(60)
    expect(result.height[5]).toBe(60)
    expect(result.height[6]).toBe(60)

    // Sibling no afectado mantiene offset estable en inicio de fila 3
    expect(result.x[7]).toBe(0)
    expect(result.y[7]).toBe(60)
  })

  test('comportamiento evidencia remeasure localizado único: no hay segundo reflow global ni deriva en items no afectados', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
          children: [
            { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // No afectados permanecen idénticos
    expect(result.height[1]).toBe(30)
    expect(result.height[2]).toBe(30)
    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.x[2]).toBe(0)
    expect(result.y[2]).toBe(30)

    // Re-measure localizado del afectado: exactamente altura normalizada del span
    expect(result.height[3]).toBe(60)
    expect(result.height[4]).toBe(60)

    // Si hubiese segundo reflow global o múltiples recomputaciones no localizadas,
    // este y-offset tendería a derivar por contaminación de filas.
    expect(result.x[5]).toBe(0)
    expect(result.y[5]).toBe(60)
  })

  test('paridad: explicit gridRow + gridRowSpan + height 100% re-mide nested grid/flex con la misma altura final que auto-placed equivalente', () => {
    const explicitComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: {
                display: 'grid',
                gridTemplateColumns: 2,
                width: '100%',
                height: '100%',
              } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
              ],
            },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const autoComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: {
                display: 'grid',
                gridTemplateColumns: 2,
                width: '100%',
                height: '100%',
              } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
              ],
            },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const explicitPrepared = prepare(explicitComp, undefined, { textEngine: fakeTextEngine })
    const autoPrepared = prepare(autoComp, undefined, { textEngine: fakeTextEngine })

    const explicitResult = reflow(explicitPrepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })
    const autoResult = reflow(autoPrepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Paridad de altura final normalizada en row-span equivalente: 30 + 30 = 60
    expect(explicitResult.height[1]).toBe(60)
    expect(explicitResult.height[2]).toBe(60)
    expect(autoResult.height[3]).toBe(60)
    expect(autoResult.height[4]).toBe(60)

    // Sibling no afectado en misma posición final
    expect(explicitResult.x[7]).toBe(0)
    expect(explicitResult.y[7]).toBe(60)
    expect(autoResult.x[7]).toBe(0)
    expect(autoResult.y[7]).toBe(60)
  })

  test('breakpoints dentro de nested row-spanned 100% no mueven siblings no afectados (explícito y auto)', () => {
    const explicitComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridColumn: 2, gridRow: 1, gridRowSpan: 2 } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: {
                display: 'grid',
                gridTemplateColumns: 2,
                width: '100%',
                height: '100%',
                breakpoints: [
                  { maxWidth: 100, layout: { gridTemplateColumns: 1 } },
                  { minWidth: 101, layout: { gridTemplateColumns: 2 } },
                ],
              } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
              ],
            },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const autoComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '100%', gridRowSpan: 2 } as any,
          children: [
            {
              type: 'element' as const,
              tag: 'div',
              layout: {
                display: 'grid',
                gridTemplateColumns: 2,
                width: '100%',
                height: '100%',
                breakpoints: [
                  { maxWidth: 100, layout: { gridTemplateColumns: 1 } },
                  { minWidth: 101, layout: { gridTemplateColumns: 2 } },
                ],
              } as any,
              children: [
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
                { type: 'element' as const, tag: 'div', layout: { height: '100%' } as any },
              ],
            },
          ],
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const explicitPrepared = prepare(explicitComp, undefined, { textEngine: fakeTextEngine })
    const autoPrepared = prepare(autoComp, undefined, { textEngine: fakeTextEngine })

    const explicitNarrow = reflow(explicitPrepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })
    const explicitWide = reflow(explicitPrepared, { maxWidth: 300, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })
    const autoNarrow = reflow(autoPrepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })
    const autoWide = reflow(autoPrepared, { maxWidth: 300, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(explicitNarrow.y[7]).toBe(60)
    expect(explicitWide.y[7]).toBe(60)
    expect(autoNarrow.y[7]).toBe(60)
    expect(autoWide.y[7]).toBe(60)
  })

  test('row-spanned normalizado que excede alturas provisionales reconcilia filas cubiertas para evitar contradicción interna', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '300%', gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Span auto-placed en (row1,col2): base provisional filas = 10 + 10, normalizado 300% = 60
    expect(result.x[3]).toBe(100)
    expect(result.y[3]).toBe(0)
    expect(result.height[3]).toBe(60)

    // Reconciliación mínima: el contenido de filas cubiertas debe ser coherente con la altura normalizada.
    expect(result.height[0]).toBe(60)
  })

  test('reconciliación local conserva y-offset de siblings no afectados en casos canónicos', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '300%', gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Siblings no afectados mantienen offsets canónicos.
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(10)
  })

  test('items sin rowSpan mantienen su altura medida sin cambios bajo reconciliación local', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '300%', gridRowSpan: 2 } as any,
        },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[1]).toBe(10)
    expect(result.height[2]).toBe(10)
  })

  test('fallback determinista: si reconciliar implica churn amplio en filas posteriores, se omite reconciliación', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        {
          type: 'element' as const,
          tag: 'div',
          layout: { height: '300%', gridRowSpan: 2 } as any,
        },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Altura normalizada del row-spanned se conserva.
    expect(result.height[3]).toBe(60)

    // Fallback determinista: se preservan offsets previos de fila posterior (sin churn amplio).
    expect(result.x[4]).toBe(0)
    expect(result.y[4]).toBe(20)
    expect(result.height[0]).toBe(30)
  })

  test('no-regresión: items sin rowSpan conservan comportamiento previo', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 30, gridColumn: 2, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 2, gridRow: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 240 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[1]).toBe(30)
    expect(result.height[2]).toBe(30)
    expect(result.height[3]).toBe(10)
    expect(result.height[4]).toBe(10)
    expect(result.y[3]).toBe(30)
    expect(result.y[4]).toBe(30)
  })
})

// ============================================================
// Grid row-height reconciliation — rowGap y rowSpan > 2
// ============================================================

describe('grid row-height reconciliation — rowGap y rowSpan sobre 3+ filas', () => {
  test('rowSpan=3 con rowGap: effectiveSpanHeight incluye rowGap * (rowSpan - 1)', () => {
    // 2 columnas, rowGap=5
    // 3 items explícitos en col1 (rows 0-2): height=10 cada uno
    // 1 item auto-placed en col2: height='100%', rowSpan=3
    // effectiveSpanHeight = 10 + 10 + 10 + 5*2 = 40
    // normalizedHeight = 40 * 1 = 40
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2, rowGap: 5 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 3 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 3 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 500 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // rowGap contribuye directamente a la base de normalización:
    // 100% de (10+10+10 + 5*2) = 40, no 30 (sin gap)
    expect(result.height[4]).toBe(40)
  })

  test('reconciliación aplica cuando placements posteriores están solo dentro de filas cubiertas (no debajo)', () => {
    // Regla: la guardia es candidate.row > coveredEndRow (ESTRICTO).
    // Un placement en row == coveredEndRow NO bloquea la reconciliación.
    // Grid: 2 cols, sin rowGap
    // col1 row1=10, col1 row2=10, col1 row3=5 (todas en rows 0-2 = rango cubierto)
    // Auto-placed col2: height='200%', rowSpan=3 → normalizedHeight=50 > currentSpanHeight=25 → reconcilia
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 5, gridColumn: 1, gridRow: 3 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '200%', gridRowSpan: 3 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 500 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // currentSpanHeight = 25, normalizedHeight = 50
    // coveredEndRow = 2; col1 items en rows 0,1,2 → ninguno > 2 → reconciliación aplica
    // déficit = 25, rowHeights[2] += 25 → rowHeights=[10,10,30]
    // container height = 10+10+30 = 50
    expect(result.height[4]).toBe(50)
    expect(result.height[0]).toBe(50)
    // y-offsets de siblings dentro del rango se preservan (sin reflow global)
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(10)
    expect(result.y[3]).toBe(20)
  })

  test('reconciliación omite cuando hay sibling estrictamente por debajo de filas cubiertas (rowSpan=3 con rowGap)', () => {
    // Grid: 2 cols, rowGap=5
    // col1 items a rows 0,1,2 (altura=10) + col1 item en row 3 (altura=10, DEBAJO del span)
    // Auto-placed col2: height='200%', rowSpan=3 → normalizedHeight=80 > currentSpanHeight=40
    // Guardia: item en row=3 > coveredEndRow=2 → hasLaterPlacements=TRUE → SKIP
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2, rowGap: 5 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 1 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 3 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '200%', gridRowSpan: 3 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10, gridColumn: 1, gridRow: 4 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 500 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Altura normalizada se preserva aunque reconciliación se omita
    expect(result.height[4]).toBe(80)
    // rowHeights sin modificar: [10,10,10,10] — sibling debajo mantiene y-offset estable
    // rowOffsets con rowGap=5: row0=0, row1=15, row2=30, row3=45
    expect(result.y[5]).toBe(45)
    expect(result.height[5]).toBe(10)
    // container height = 10*4 + 3*5 = 55
    expect(result.height[0]).toBe(55)
  })

  test('no-regresión: grid con rowGap sin rowSpan mantiene y-offsets correctos', () => {
    // Verifica que la lógica de reconciliación no altera items sin rowSpan
    // Grid: 2 cols, rowGap=8, 3 filas de 2 items cada una
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2, rowGap: 8 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 20 } },
        { type: 'element' as const, tag: 'div', layout: { height: 20 } },
        { type: 'element' as const, tag: 'div', layout: { height: 15 } },
        { type: 'element' as const, tag: 'div', layout: { height: 15 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 500 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Fila 0: y=0; fila 1: y=20+8=28; fila 2: y=28+15+8=51
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(0)
    expect(result.y[3]).toBe(28)
    expect(result.y[4]).toBe(28)
    expect(result.y[5]).toBe(51)
    expect(result.y[6]).toBe(51)
    // Alturas sin cambio
    expect(result.height[1]).toBe(20)
    expect(result.height[3]).toBe(15)
    expect(result.height[5]).toBe(10)
  })
})

// ============================================================
// Grid row-height reconciliation — múltiples spans normalizados
// sobre la misma fila cubierta (covered last row overlap)
// ============================================================
//
// Problema: cuando dos items row-spanned con height:% son ambos diferidos
// al segundo pase (auto-placed o explícitos sin base determinable), sus
// rowHeights quedan en 0 tras el primer pase. La reconciliación anterior
// usaba resolveDeterminableVerticalSpanHeight que devuelve undefined para
// filas con altura 0, saltando la reconciliación para AMBOS items.
// Resultado: la altura del contenedor quedaba en 0 aunque ambos items
// hubiesen obtenido su normalizedHeight correcta.
//
// Regla implementada (determinista):
// - currentSpanHeight para reconciliación = suma de rowHeights incluyendo ceros
//   (no undefined) + rowGap*(rowSpan-1).
// - "El máximo gana": el primer item en orden de fuente añade su déficit completo;
//   el segundo sólo añade lo que falta para alcanzar SU normalizedHeight.
// - Resultado final = max(normalizedA, normalizedB) en la última fila cubierta.
// - Orden de fuente es la base de desempate determinista cuando los dos difieren.
// - Anti-churn: si hay hermanos ESTRICTAMENTE debajo (row > coveredEndRow),
//   la reconciliación sigue bloqueada para todos los spans que la cubren.
//
// Limitación conocida:
// - Cuando el primer item reconcilia y modifica rowHeights, el segundo item
//   puede ver una effectiveSpanHeight diferente para su normalizationBase
//   (dependiendo de si rowHeights[startRow] sigue siendo 0). En el caso
//   canónico (todas las filas del span a 0 en el primer pase), ambos items
//   usan availableHeight como fallback y el resultado es estable.
// ============================================================

describe('grid row-height reconciliation — múltiples spans normalizados sobre misma fila cubierta', () => {
  test('dos items row-spanned auto-placed sobre mismas filas: déficit reconcilia, contenedor refleja el máximo', () => {
    // 2 cols, no rowGap, ambos items rowSpan=2, height='100%', auto-placed.
    // Ambos cubren rows 0-1 (coveredEndRow=1).
    // Primer pase: ambos aportados con height=0 → rowHeights=[0,0].
    // Segundo pase (ANTES del fix): currentSpanHeight=undefined → ambos saltan → contenedor=0. BUG.
    // Segundo pase (CON fix):
    //   A (src-order 1): currentSpanHeight=0, deficit=80 → rowHeights=[0,80]
    //   B (src-order 2): currentSpanHeight=80, normalizedB=80 ≤ 80 → no-op
    //   Contenedor: contentHeight=80 ✓
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 80 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // Alturas individuales normalizadas correctamente
    expect(result.height[1]).toBe(80)
    expect(result.height[2]).toBe(80)

    // Ambos en col 0 y col 1 de la misma fila 0
    expect(result.x[1]).toBe(0)
    expect(result.y[1]).toBe(0)
    expect(result.x[2]).toBe(100)
    expect(result.y[2]).toBe(0)

    // Contenedor: DEBE reflejar la altura del span (max de los dos normalized = 80)
    // ANTES del fix este era 0 — éste es el caso RED principal.
    expect(result.height[0]).toBe(80)
  })

  test('resultado determinista: el máximo gana independientemente del orden de fuente', () => {
    // Item A (80%) y item B (100%) sobre mismas rows 0-1, availableHeight=100.
    // normalizedA=80, normalizedB=100 → contenedor=100.
    // Orden A→B: A reconcilia +80, B añade +20. rowHeights=[0,100].
    // Orden B→A: B reconcilia +100, A ve currentSpanHeight=100 ≥ 80 → no-op. Mismo resultado.
    const compAB = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: '80%', gridRowSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
      ],
    }))

    const compBA = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        // Orden invertido: B (100%) primero, A (80%) segundo
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '80%', gridRowSpan: 2 } as any },
      ],
    }))

    const preparedAB = prepare(compAB, undefined, { textEngine: fakeTextEngine })
    const resultAB = reflow(preparedAB, { maxWidth: 200, maxHeight: 100 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    const preparedBA = prepare(compBA, undefined, { textEngine: fakeTextEngine })
    const resultBA = reflow(preparedBA, { maxWidth: 200, maxHeight: 100 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // A=80%, B=100%, max=100 en ambos órdenes → contenedor idéntico
    expect(resultAB.height[0]).toBe(100)
    expect(resultBA.height[0]).toBe(100)

    // Alturas individuales correctas según orden de fuente
    expect(resultAB.height[1]).toBe(80)   // A es 80% de 100
    expect(resultAB.height[2]).toBe(100)  // B es 100% de 100
    expect(resultBA.height[1]).toBe(100)  // B (ahora idx=1) es 100% de 100
    expect(resultBA.height[2]).toBe(80)   // A (ahora idx=2) es 80% de 100
  })

  test('hermano estrictamente debajo preserva y-offset estable cuando guardia anti-churn bloquea reconciliación', () => {
    // A (rows 0-1, rowSpan=2) y B (rows 0-1, rowSpan=2) más C en row 2.
    // C está ESTRICTAMENTE DEBAJO (row=2 > coveredEndRow=1).
    // hasLaterPlacements=true para A y B → ambos saltan reconciliación.
    // rowHeights queda en [0, 0, 10].
    // C.y = rowOffsets[2] = 0 + 0 + 2*rowGap = 0 → estable.
    // Este test documenta el comportamiento anti-churn tras el fix:
    // la nueva lógica no activa reconciliación donde hasLaterPlacements lo bloquea.
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: '100%', gridRowSpan: 2 } as any },
        { type: 'element' as const, tag: 'div', layout: { height: 10 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 80 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    // A y B tienen alturas normalizadas correctas (normalización ocurre antes de reconciliación)
    expect(result.height[1]).toBe(80)
    expect(result.height[2]).toBe(80)

    // C (idx=3) no fue afectado
    expect(result.height[3]).toBe(10)

    // y de C es determinista: rowHeights = [0, 0, 10] sin reconciliación → rowOffsets[2] = 0
    // La guardia anti-churn preservó los offsets existentes tal como están.
    expect(result.y[3]).toBe(0)
  })

  test('no regresión: items sin rowSpan no son afectados por la nueva lógica de reconciliación múltiple', () => {
    // Grid normal 2×2 sin ningún rowSpan ni height:%.
    // Verifica que la refactorización de reconcileCoveredRowsForNormalizedSpan
    // no altera el comportamiento de items que nunca pasan por el segundo pase.
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 2 } as any,
      children: [
        { type: 'element' as const, tag: 'div', layout: { height: 20 } },
        { type: 'element' as const, tag: 'div', layout: { height: 15 } },
        { type: 'element' as const, tag: 'div', layout: { height: 12 } },
        { type: 'element' as const, tag: 'div', layout: { height: 12 } },
      ],
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 200, maxHeight: 200 }, { lineHeight: DEFAULT_LINE_HEIGHT })

    expect(result.height[1]).toBe(20)
    expect(result.height[2]).toBe(15)
    expect(result.height[3]).toBe(12)
    expect(result.height[4]).toBe(12)

    // Fila 0: y=0; fila 1: y=max(20,15)=20
    expect(result.y[1]).toBe(0)
    expect(result.y[2]).toBe(0)
    expect(result.y[3]).toBe(20)
    expect(result.y[4]).toBe(20)

    // Contenedor = 20 + 12 = 32
    expect(result.height[0]).toBe(32)
  })
})

// ============================================================
// measureTextChild helper — unit tests (Tasks 1.1 / 1.3)
// ============================================================

describe('measureTextChild helper — unit', () => {
  test('returns availableWidth as width', () => {
    const font: FontData = { availableWidth: 200, lineHeight: 20 }
    const result = measureTextChild('Hello', font, false)
    expect(result.width).toBe(200)
  })

  test('single line when text fits without wrapping', () => {
    // "Hello" = 5 chars, charWidth=8, charsPerLine = floor(400/8) = 50 → fits in 1 line
    const font: FontData = { availableWidth: 400, lineHeight: 20 }
    const result = measureTextChild('Hello', font, true)
    // lineCount = ceil((5/50) * 1.4) = ceil(0.14) = 1
    expect(result.height).toBe(20)
  })

  test('wrapped text height uses charWidth=8 and wordWrapFactor=1.4', () => {
    // "Hello World" = 11 chars, availableWidth=30, charWidth=8
    // charsPerLine = floor(30/8) = 3
    // lineCount = ceil((11/3) * 1.4) = ceil(5.133) = 6
    const font: FontData = { availableWidth: 30, lineHeight: 20 }
    const result = measureTextChild('Hello World', font, true)
    expect(result.height).toBe(120) // 6 * 20
  })

  test('wordWrap=false does NOT apply the 1.4 factor', () => {
    // 11 chars, charsPerLine=floor(30/8)=3, lineCount=ceil(11/3)=4 (no factor)
    const font: FontData = { availableWidth: 30, lineHeight: 20 }
    const result = measureTextChild('Hello World', font, false)
    expect(result.height).toBe(80) // 4 * 20
  })

  test('minimum one line even for very wide containers', () => {
    const font: FontData = { availableWidth: 10000, lineHeight: 20 }
    const result = measureTextChild('Hi', font, true)
    expect(result.height).toBe(20)
    expect(result.height).toBeGreaterThan(0)
  })

  test('minimum one char per line when availableWidth is very small', () => {
    // charsPerLine = max(1, floor(1/8)) = 1, 5 chars, lineCount = ceil((5/1)*1.4) = 7
    const font: FontData = { availableWidth: 1, lineHeight: 20 }
    const result = measureTextChild('Hello', font, true)
    expect(result.height).toBe(140) // 7 * 20
  })

  test('lineHeight is factored into height correctly', () => {
    const font: FontData = { availableWidth: 400, lineHeight: 16 }
    const result = measureTextChild('Hello', font, true)
    // 1 line * 16
    expect(result.height).toBe(16)
  })
})

// ============================================================
// Cross-engine text height consistency (Tasks 3.1)
// ============================================================

describe('cross-engine text height consistency', () => {
  const TEXT = 'Hello World this is a longer piece of text to force wrapping'
  const WIDTH = 120
  const LINE_HEIGHT = 20

  function buildFlexComp(text: string) {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'column' },
      children: [{ type: 'text' as const, content: text }],
    }))
  }

  function buildGridComp(text: string) {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { display: 'grid', gridTemplateColumns: 1 } as any,
      children: [{ type: 'text' as const, content: text }],
    }))
  }

  function buildStackComp(text: string) {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: text }],
    }))
  }

  test('stack and flex produce equal text height for wrapped text', () => {
    const stackPrepared = prepare(buildStackComp(TEXT), undefined, { textEngine: fakeTextEngine })
    const flexPrepared = prepare(buildFlexComp(TEXT), undefined, { textEngine: fakeTextEngine })

    const stackResult = reflow(stackPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })
    const flexResult = reflow(flexPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })

    // Text node is idx=1 in both trees
    expect(stackResult.height[1]).toBe(flexResult.height[1])
    expect(stackResult.height[1]).toBeGreaterThan(LINE_HEIGHT) // must actually wrap
  })

  test('flex and grid produce equal text height for wrapped text', () => {
    const flexPrepared = prepare(buildFlexComp(TEXT), undefined, { textEngine: fakeTextEngine })
    const gridPrepared = prepare(buildGridComp(TEXT), undefined, { textEngine: fakeTextEngine })

    const flexResult = reflow(flexPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })
    const gridResult = reflow(gridPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })

    expect(flexResult.height[1]).toBe(gridResult.height[1])
  })

  test('stack and grid produce equal text height for wrapped text', () => {
    const stackPrepared = prepare(buildStackComp(TEXT), undefined, { textEngine: fakeTextEngine })
    const gridPrepared = prepare(buildGridComp(TEXT), undefined, { textEngine: fakeTextEngine })

    const stackResult = reflow(stackPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })
    const gridResult = reflow(gridPrepared, { maxWidth: WIDTH, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })

    expect(stackResult.height[1]).toBe(gridResult.height[1])
  })

  test('non-text layout positions are not affected by unified text measurement', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row', gap: 10 },
      children: [
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
        { type: 'element' as const, tag: 'div', layout: { width: 100, height: 50 } },
      ],
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const result = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: LINE_HEIGHT })

    expect(result.x[1]).toBe(0)
    expect(result.x[2]).toBe(110) // 100 + 10 gap — non-text layout unchanged
  })
})

// ============================================================
// layoutText (reflow.ts leaf text path) — approval test (Task 2.1)
// ============================================================
// layoutText is called when layoutNode receives a text node as the root.
// Before the fix: charWidth=6, no wordWrap factor.
// After the fix: uses measureTextChild (charWidth=8, wordWrapFactor=1.4).
// These tests document the NEW (correct) behavior.
// ============================================================

describe('reflow — leaf text node (layoutText path)', () => {
  function prepareText(content: string) {
    const comp = defineComponent(() => ({ type: 'text' as const, content }))
    return prepare(comp, undefined, { textEngine: fakeTextEngine })
  }

  test('root text node: single line when text fits (charWidth=8)', () => {
    // "Hello" = 5 chars, availableWidth=400, charWidth=8, charsPerLine=50 → 1 line
    const prepared = prepareText('Hello')
    const result = reflow(prepared, { maxWidth: 400, maxHeight: 1000 }, { lineHeight: 20 })
    expect(result.height[0]).toBe(20)
    expect(result.width[0]).toBe(400)
  })

  test('root text node: wrapped text uses charWidth=8 and 1.4x factor', () => {
    // "Hello World" = 11 chars, maxWidth=30, charWidth=8
    // charsPerLine = floor(30/8) = 3
    // lineCount = ceil((11/3) * 1.4) = ceil(5.13) = 6
    const prepared = prepareText('Hello World')
    const result = reflow(prepared, { maxWidth: 30, maxHeight: 1000 }, { lineHeight: 20 })
    expect(result.height[0]).toBe(120) // 6 lines * 20
  })
})
