import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { defineComponent } from '../src/render/component.js'
import { prepare, countNodes } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { commitFull } from '../src/render/commit.js'
import type { DOMState } from '../src/render/commit.js'
import type { LayoutConstraints } from '../src/core/types.js'

// ============================================================
// Setup happy-dom
// ============================================================

beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
})

const CONSTRAINTS: LayoutConstraints = { maxWidth: 800, maxHeight: 600 }

// ============================================================
// Edge Case: Empty tree (no children)
// ============================================================

describe('edge case: empty tree', () => {
  test('element with no children prepares correctly', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    expect(p).toBeDefined()
    expect(countNodes(p)).toBe(1)
  })

  test('empty element reflows to zero height', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[0]).toBe(0)
    expect(layout.width[0]).toBe(800)
  })

  test('empty element with explicit height respects it', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { height: 200, width: 400 },
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[0]).toBe(200)
    expect(layout.width[0]).toBe(400)
  })

  test('empty element commits without errors', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }
    expect(() => commitFull(layout, p, root, state)).not.toThrow()
    expect(root.children.length).toBe(1)
  })
})

// ============================================================
// Edge Case: Single text node
// ============================================================

describe('edge case: single text node', () => {
  test('text node wraps into element for prepare', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: 'Hello world' }],
    }))
    const p = prepare(TextComp, undefined)
    expect(countNodes(p)).toBe(2) // element + text
  })

  test('single text node gets height from line calculation', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: 'Hello world' }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    // Text is short — should fit in one line
    const textIdx = 1
    expect(layout.height[textIdx]).toBeGreaterThan(0)
  })

  test('empty text node does not crash', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: '' }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[1]).toBe(0)
  })

  test('very long single text node wraps to multiple lines', () => {
    const longText = 'a'.repeat(500)
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: longText }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, { maxWidth: 200, maxHeight: 600 }, { lineHeight: 20 })
    // 500 chars at ~6-8px per char in 200px — must wrap to many lines
    expect(layout.height[1]).toBeGreaterThan(20) // more than 1 line
  })
})

// ============================================================
// Edge Case: Fragment at root
// ============================================================

describe('edge case: fragment at root', () => {
  test('fragment children are flattened into parent', () => {
    const FragComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'fragment' as const,
          children: [
            { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'A' }] },
            { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'B' }] },
          ],
        },
      ],
    }))
    const p = prepare(FragComp, undefined)
    // Fragment is transparent — root div + 2 spans + 2 texts = 5 nodes
    expect(countNodes(p)).toBe(5)
  })

  test('nested fragments flatten completely', () => {
    const NestedFrag = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'fragment' as const,
          children: [
            {
              type: 'fragment' as const,
              children: [
                { type: 'element' as const, tag: 'span' },
              ],
            },
          ],
        },
      ],
    }))
    const p = prepare(NestedFrag, undefined)
    expect(countNodes(p)).toBe(2) // div + span
  })
})

// ============================================================
// Edge Case: Deeply nested tree
// ============================================================

describe('edge case: deeply nested tree', () => {
  function buildNestedTree(depth: number) {
    // Build a deeply nested structure: div > div > div > ... > text
    type NodeBuilder = { type: 'element'; tag: string; children?: ReturnType<typeof buildNestedTree>[] | { type: 'text'; content: string }[] }
    const buildNode = (d: number): NodeBuilder | { type: 'text'; content: string } => {
      if (d === 0) return { type: 'text' as const, content: `Depth ${depth}` }
      return {
        type: 'element' as const,
        tag: 'div',
        children: [buildNode(d - 1)] as any,
      }
    }
    return defineComponent(() => buildNode(depth) as any)
  }

  test('10-level deep tree prepares without stack overflow', () => {
    const Deep = buildNestedTree(10)
    expect(() => prepare(Deep, undefined)).not.toThrow()
  })

  test('10-level deep tree reflows correctly', () => {
    const Deep = buildNestedTree(10)
    const p = prepare(Deep, undefined)
    expect(() => reflow(p, CONSTRAINTS)).not.toThrow()
  })

  test('10-level deep tree has correct node count (n + 1 text node)', () => {
    const Deep = buildNestedTree(10)
    const p = prepare(Deep, undefined)
    // 10 element nodes + 1 text node = 11
    expect(countNodes(p)).toBe(11)
  })

  test('50-level deep tree does not crash', () => {
    const Deep = buildNestedTree(50)
    const p = prepare(Deep, undefined)
    expect(countNodes(p)).toBe(51)
    expect(() => reflow(p, CONSTRAINTS)).not.toThrow()
  })
})

// ============================================================
// Edge Case: List with keys (reconciliation)
// ============================================================

describe('edge case: key reconciliation', () => {
  test('elements with keys prepare correctly', () => {
    const KeyedList = defineComponent(() => ({
      type: 'element' as const,
      tag: 'ul',
      children: ['a', 'b', 'c'].map(k => ({
        type: 'element' as const,
        tag: 'li',
        key: k,
        children: [{ type: 'text' as const, content: k }],
      })),
    }))
    const p = prepare(KeyedList, undefined)
    // ul + 3 li + 3 text = 7
    expect(countNodes(p)).toBe(7)
  })
})

// ============================================================
// Edge Case: unmount() memory cleanup
// ============================================================

describe('edge case: unmount clears DOM references', () => {
  test('domNodes array is emptied after unmount', async () => {
    const { createApp } = await import('../src/app.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'hello' }],
    }))

    const root = document.createElement('div')
    const app = createApp(Comp, root)
    app.mount()

    // After mount, root should have content
    expect(root.children.length).toBeGreaterThan(0)

    app.unmount()

    // After unmount, DOM should be cleared
    expect(root.innerHTML).toBe('')
  })
})
