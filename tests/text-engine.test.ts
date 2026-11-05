import { describe, expect, mock, test } from 'bun:test'
import type { LayoutProps } from '../src/core/types.js'
import { defineComponent } from '../src/render/component.js'
import { getChildren, getTextContent, getTextHandle, getTextLineCount, prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'

function textComponent(content: string, layout?: LayoutProps) {
  return defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    layout,
    children: [{ type: 'text' as const, content }],
  }))
}

describe('consumer text layout engine', () => {
  for (const [name, layout, width] of [
    ['fast path', undefined, 120],
    ['flex', { padding: 10 }, 100],
    ['grid', { display: 'grid', gridTemplateColumns: 2 }, 60],
  ] as const) {
    test(`honors opaque handles and engine height through ${name}`, () => {
      const handle = Symbol('prepared text')
      const metrics = { lineCount: 7, height: 93 }
      const engine = {
        prepare: mock((_text: string, _font: string) => handle),
        layout: mock((_handle: unknown, _width: number, _lineHeight: number) => metrics),
        clearCache: mock(),
      }
      const prepared = prepare(textComponent('Hello World', layout), undefined, {
        textEngine: engine,
        font: '18px serif',
      })
      const child = getChildren(prepared)[0]!
      const result = reflow(prepared, { maxWidth: 120, maxHeight: 1000 }, { lineHeight: 24 })

      expect(engine.prepare).toHaveBeenCalledWith('Hello World', '18px serif')
      expect(engine.layout).toHaveBeenCalledWith(handle, width, 24)
      expect(result.width[1]).toBe(width)
      expect(result.height[1]).toBe(93) // Not lineCount * lineHeight or the fallback heuristic.
      expect(getTextLineCount(child)).toBe(7)
      expect(result.height[0]).toBe(93 + (name === 'flex' ? 20 : 0))
      expect(getTextHandle(child)).toBe(handle)
      expect(getTextContent(child)).toBe('Hello World')
    })
  }

  test('recomputes layout with current width and line height without preparing again', () => {
    const handle = 0 // A valid opaque handle need not be an object or truthy.
    const metrics = { lineCount: 0, height: 0 }
    const engine = {
      prepare: mock(() => handle),
      layout: mock((_handle: unknown, width: number, lineHeight: number) => {
        metrics.lineCount = width < 100 ? 4 : 2
        metrics.height = metrics.lineCount * lineHeight
        return metrics
      }),
      clearCache: mock(),
    }
    const prepared = prepare(textComponent('Hello'), undefined, { textEngine: engine })
    const narrow = reflow(prepared, { maxWidth: 80, maxHeight: 1000 }, { lineHeight: 12 })
    expect(narrow.height[1]).toBe(48)
    expect(getTextLineCount(getChildren(prepared)[0]!)).toBe(4)
    const wide = reflow(prepared, { maxWidth: 200, maxHeight: 1000 }, { lineHeight: 30 })
    expect(wide.height[1]).toBe(60)
    expect(getTextLineCount(getChildren(prepared)[0]!)).toBe(2)
    expect(engine.layout).toHaveBeenNthCalledWith(1, handle, 80, 12)
    expect(engine.layout).toHaveBeenNthCalledWith(2, handle, 200, 30)
    expect(engine.prepare).toHaveBeenCalledTimes(1)
  })

  test('delegates empty root text to the engine even with an undefined handle', () => {
    const engine = {
      prepare: () => undefined,
      layout: mock(() => ({ lineCount: 2, height: 31 })),
      clearCache() {},
    }
    const component = defineComponent(() => ({ type: 'text' as const, content: '' }))
    const prepared = prepare(component, undefined, { textEngine: engine })
    const result = reflow(prepared, { maxWidth: 50, maxHeight: 1000 })
    expect(engine.layout).toHaveBeenCalledWith(undefined, 50, 20)
    expect(result.width[0]).toBe(50)
    expect(result.height[0]).toBe(31)
  })

  test('preserves heuristic wrapping and helpers without an engine', () => {
    const prepared = prepare(textComponent('Hello World'), undefined)
    const child = getChildren(prepared)[0]!
    const narrow = reflow(prepared, { maxWidth: 30, maxHeight: 1000 }, { lineHeight: 20 })
    expect(narrow.width[1]).toBe(30)
    expect(narrow.height[1]).toBe(120)
    expect(narrow.height[0]).toBe(120)
    const wide = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: 20 })
    expect(wide.height[1]).toBe(20)
    expect(getTextHandle(child)).toBeUndefined()
    expect(getTextContent(child)).toBe('Hello World')
  })

  test('preserves empty text behavior without an engine', () => {
    const component = defineComponent(() => ({ type: 'text' as const, content: '' }))
    const result = reflow(prepare(component, undefined), { maxWidth: 120, maxHeight: 1000 })
    expect(result.width[0]).toBe(120)
    expect(result.height[0]).toBe(0)
  })
})
