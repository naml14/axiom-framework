import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { applyOps, commitFull, type DOMOperation } from '../src/render/commit.js'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'

// Setup happy-dom
beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
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
// applyOps tests
// ============================================================

describe('applyOps', () => {
  test('inserts create DOM nodes', () => {
    const root = document.createElement('div')
    const domNodes: (HTMLElement | Text | null)[] = []

    const ops: DOMOperation[] = [
      { type: 'insert', index: 0, tag: 'div', classes: ['container'] },
      { type: 'insert', index: 1, textContent: 'Hello' },
    ]

    applyOps(ops, root, domNodes)

    expect(root.childNodes.length).toBe(2)
    expect((root.childNodes[0] as HTMLElement).className).toBe('container')
    expect((root.childNodes[1] as Text).textContent).toBe('Hello')
  })

  test('removes delete DOM nodes', () => {
    const root = document.createElement('div')
    const child = document.createElement('span')
    root.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'remove', index: 0 },
    ]

    applyOps(ops, root, domNodes)

    expect(root.children.length).toBe(0)
    expect(domNodes[0]).toBeNull()
  })

  test('updates modify existing nodes', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    root.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 100, y: 50, width: 200, height: 100 },
    ]

    applyOps(ops, root, domNodes)

    expect(child.style.transform).toBe('translate(100px,50px)')
    expect(child.style.width).toBe('200px')
    expect(child.style.height).toBe('100px')
  })

  test('updates text content', () => {
    const root = document.createElement('div')
    const textNode = document.createTextNode('Hello')
    root.appendChild(textNode)

    const domNodes: (HTMLElement | Text | null)[] = [textNode]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, newTextContent: 'World' },
    ]

    applyOps(ops, root, domNodes)

    expect(textNode.nodeValue).toBe('World')
  })

  test('clears managed style keys when style is removed', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    child.style.color = 'red'
    ;(child as any).__axiomManagedStyleKeys = ['color']
    root.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, newStyle: undefined },
    ]

    applyOps(ops, root, domNodes)

    expect(child.style.color).toBe('')
    expect(Array.isArray((child as any).__axiomManagedStyleKeys)).toBe(true)
  })

  test('operations are applied in order: removes → updates → inserts', () => {
    const root = document.createElement('div')
    const oldChild = document.createElement('span')
    root.appendChild(oldChild)

    const domNodes: (HTMLElement | Text | null)[] = [oldChild]

    const ops: DOMOperation[] = [
      { type: 'insert', index: 1, textContent: 'New' },
      { type: 'remove', index: 0 },
      { type: 'update', index: 0, x: 10, y: 20, width: 100, height: 50 },
    ]

    applyOps(ops, root, domNodes)

    // Remove first, then update (but node was removed, so no-op), then insert
    expect(root.childNodes.length).toBe(1)
    expect((root.childNodes[0] as Text).textContent).toBe('New')
  })

  test('uses DocumentFragment for batch inserts', () => {
    const root = document.createElement('div')
    const domNodes: (HTMLElement | Text | null)[] = []

    const ops: DOMOperation[] = [
      { type: 'insert', index: 0, tag: 'div', textContent: 'A' },
      { type: 'insert', index: 1, tag: 'div', textContent: 'B' },
      { type: 'insert', index: 2, tag: 'div', textContent: 'C' },
    ]

    applyOps(ops, root, domNodes)

    expect(root.children.length).toBe(3)
    expect(domNodes.length).toBe(3)
    expect(domNodes[0]).not.toBeNull()
    expect(domNodes[1]).not.toBeNull()
    expect(domNodes[2]).not.toBeNull()
  })
})

// ============================================================
// commitFull tests
// ============================================================

describe('commitFull', () => {
  test('creates DOM tree from prepared component', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      classes: ['container'],
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: 20 })

    const root = document.createElement('div')
    const domNodes: (HTMLElement | Text | null)[] = []

    commitFull(layout, prepared, root, { domNodes, portalRoots: new Map() })

    expect(root.children.length).toBe(1)
    expect(root.children[0]!.tagName.toLowerCase()).toBe('div')
    expect(root.children[0]!.className).toBe('container')
    expect(root.children[0]!.textContent).toBe('Hello')
  })

  test('applies layout positions via transform', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: 20 })

    const root = document.createElement('div')
    const domNodes: (HTMLElement | Text | null)[] = []

    commitFull(layout, prepared, root, { domNodes, portalRoots: new Map() })

    const container = root.children[0] as HTMLElement
    expect(container.style.position).toBe('absolute')
    expect(container.style.transform).toBe('translate(0px,0px)')
    expect(container.style.width).toBe('500px')
  })

  test('sets up root container with position relative', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))

    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 1000 }, { lineHeight: 20 })

    const root = document.createElement('div')
    const domNodes: (HTMLElement | Text | null)[] = []

    commitFull(layout, prepared, root, { domNodes, portalRoots: new Map() })

    expect(root.style.position).toBe('relative')
    // overflow is NOT set to hidden — the framework measures and sets explicit
    // heights on containers, but the root must let content be visible.
    expect(root.style.overflow).toBe('')
  })
})
