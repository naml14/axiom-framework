import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { ElementNode, LayoutProps } from '../src/core/types.js'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { releaseLayoutResult } from '../src/render/pool.js'
import { getEnginesScratchPoolSizes } from '../src/render/engines/scratch.js'
import * as helpers from '../src/syntax/layout.js'

function cards(heights = [100, 40, 60, 20, 30]): ElementNode[] {
  return heights.map(height => ({ type: 'element', tag: 'article', layout: { height } }))
}

function container(layout: LayoutProps, children = cards()): ElementNode {
  return { type: 'element', tag: 'div', layout, children }
}

function layoutTree(node: ElementNode, width = 320) {
  return reflow(prepare(defineComponent(() => node), undefined), { maxWidth: width, maxHeight: 1000 })
}

const masonryLayout: LayoutProps = { display: 'masonry', gridTemplateColumns: 3, gap: 10 }

describe('masonry', () => {
  test('places every item in the shortest column, breaking ties leftmost', () => {
    const result = layoutTree(container(masonryLayout))
    expect(Array.from(result.x.slice(1, 6))).toEqual([0, 110, 220, 110, 220])
    expect(Array.from(result.y.slice(1, 6))).toEqual([0, 0, 0, 50, 70])
    expect(Array.from(result.width.slice(1, 6))).toEqual([100, 100, 100, 100, 100])
    expect(Array.from(result.height.slice(1, 6))).toEqual([100, 40, 60, 20, 30])
    expect(result.height[0]).toBe(100)
    releaseLayoutResult(result)
  })

  test('repeat columns, independent gaps and padding exclude trailing gaps', () => {
    const result = layoutTree(container({ ...masonryLayout, gridTemplateColumns: 'repeat(2, 1fr)', padding: 10, columnGap: 20, rowGap: 5 }, cards([50, 20, 40])), 240)
    expect(Array.from(result.x.slice(1, 4))).toEqual([10, 130, 130])
    expect(Array.from(result.y.slice(1, 4))).toEqual([10, 10, 35])
    expect(Array.from(result.width.slice(1, 4))).toEqual([100, 100, 100])
    expect(result.height[0]).toBe(85)
    releaseLayoutResult(result)
  })

  for (const columns of [undefined, 0, NaN, Infinity]) {
    test(`invalid or absent columns (${columns}) use one column`, () => {
      const result = layoutTree(container({ ...masonryLayout, gridTemplateColumns: columns }, cards([20, 30])))
      expect(Array.from(result.x.slice(1, 3))).toEqual([0, 0])
      expect(Array.from(result.y.slice(1, 3))).toEqual([0, 30])
      expect(result.width[1]).toBe(320)
      expect(result.height[0]).toBe(60)
      releaseLayoutResult(result)
    })
  }

  for (const parent of ['flex', 'grid', 'simple', 'masonry'] as const) {
    test(`dispatches masonry nested in ${parent}`, () => {
      const child = container({ ...masonryLayout, gridTemplateColumns: 2 }, cards([50, 20, 40]))
      const parentLayout: LayoutProps = parent === 'simple' ? {} : parent === 'flex'
        ? { flexDirection: 'column' } : { display: parent, gridTemplateColumns: 1 }
      const root = container(parentLayout, [child])
      if (parent === 'simple') delete root.layout
      const result = layoutTree(root, 210)
      expect(Array.from(result.x.slice(2, 5))).toEqual([0, 110, 110])
      expect(Array.from(result.y.slice(2, 5))).toEqual([0, 0, 30])
      expect(Array.from(result.width.slice(2, 5))).toEqual([100, 100, 100])
      expect(result.height[1]).toBe(70)
      expect(result.height[0]).toBe(70)
      releaseLayoutResult(result)
    })
  }

  test('measures text and nested flex/grid contents before choosing the next column', () => {
    const children: ElementNode[] = [
      container({ flexDirection: 'column', gap: 5 }, cards([20, 30])),
      container({ display: 'grid', gridTemplateColumns: 2 }, cards([20, 40])),
      { type: 'element', tag: 'p', children: [{ type: 'text', content: 'a' }] },
    ]
    const result = layoutTree(container({ ...masonryLayout, gridTemplateColumns: 2 }, children), 210)
    expect(result.height[1]).toBe(55)
    expect(result.height[4]).toBe(40)
    expect(result.x[7]).toBe(110)
    expect(result.y[7]).toBe(50)
    expect(result.height[7]).toBe(20)
    expect(result.height[0]).toBe(70)
    releaseLayoutResult(result)
  })

  test('preserves explicit container height and clamps narrow column widths', () => {
    const result = layoutTree(container({ ...masonryLayout, height: 200 }, cards([20])), 10)
    expect(result.width[1]).toBe(0)
    expect(result.height[0]).toBe(200)
    releaseLayoutResult(result)
  })

  test('helper merges user layout and forwards tag, children and attributes', () => {
    expect('masonry' in helpers).toBe(true)
    const masonry = (helpers as typeof helpers & { masonry: typeof helpers.grid }).masonry
    const child = cards([20])[0]!
    const node = masonry(2, { tag: 'section', gap: 8, columnGap: 12, rowGap: 4, padding: 3, id: 'cards', layout: { rowGap: 6 } }, child)
    expect(node.tag).toBe('section')
    expect(node.attrs?.id).toBe('cards')
    expect(node.children).toEqual([child])
    expect(node.layout).toEqual({ display: 'masonry', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, columnGap: 12, rowGap: 6, padding: 3 })
  })

  test('existing flex, grid and simple positioning stays unchanged', () => {
    for (const kind of ['flex', 'grid', 'simple'] as const) {
      const node = container(kind === 'grid' ? { display: 'grid', gridTemplateColumns: 2, gap: 10 } : { flexDirection: 'column', gap: 10 }, cards([20, 30]))
      if (kind === 'simple') delete node.layout
      const result = layoutTree(node, 210)
      expect(result.x[2]).toBe(kind === 'grid' ? 110 : 0)
      expect(result.y[2]).toBe(kind === 'grid' ? 0 : kind === 'simple' ? 0 : 30)
      expect(result.height[0]).toBe(kind === 'grid' ? 30 : kind === 'simple' ? 0 : 60)
      releaseLayoutResult(result)
    }
  })

  test('repeated nested measurements reuse bounded engine scratch', () => {
    const prepared = prepare(defineComponent(() => container(masonryLayout, [container(masonryLayout)])), undefined)
    for (let i = 0; i < 200; i++) releaseLayoutResult(reflow(prepared, { maxWidth: 320, maxHeight: 1000 }))
    const warmSize = getEnginesScratchPoolSizes().grid
    expect(warmSize).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < 200; i++) releaseLayoutResult(reflow(prepared, { maxWidth: 320, maxHeight: 1000 }))
    expect(getEnginesScratchPoolSizes().grid).toBe(warmSize)
    expect(warmSize).toBeLessThanOrEqual(32)
  })

  test('engine has no DOM access or duplicate column parser', () => {
    const source = readFileSync(new URL('../src/render/engines/masonry.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\b(document|window|getBoundingClientRect|getClientRects|offsetHeight|offsetWidth|clientWidth|clientHeight|scrollHeight|scrollWidth|getComputedStyle|measureText)\b/)
    expect(source).not.toMatch(/RegExp|\.exec\(|\.trim\(|parseInt/)
    expect(source).toContain('resolveColumnCount')
  })
})
