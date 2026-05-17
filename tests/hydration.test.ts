import { describe, test, expect, beforeEach } from 'bun:test'
import { Window } from 'happy-dom'
import {
  defineComponent,
  createPortal,
  renderToString,
  prepare,
  reflow,
  commitHydrate,
} from '../src/index.js'
import type { ComponentNode } from '../src/index.js'
import { forEachNode, getNodeIndex, getNodeType } from '../src/render/prepare.js'

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

function installWindow(html?: string): Window {
  const win = new Window()
  globalThis.window = win as unknown as typeof globalThis.window
  globalThis.document = win.document as unknown as Document
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = win.Text as unknown as typeof Text
  if (html !== undefined) {
    win.document.write(html)
  }
  return win
}

function getHydrationRoot(): HTMLElement {
  const root = document.getElementById('app')
  if (root === null) {
    throw new Error('SSR root #app not found in test DOM')
  }
  return root as HTMLElement
}

beforeEach(() => {
  installWindow()
  ;(globalThis as { __AXIOM_HYDRATION_DEBUG__?: unknown }).__AXIOM_HYDRATION_DEBUG__ = undefined
})

describe('hydration: markers and happy path', () => {
  test('SSR incluye data-axiom-id para todos los nodos de elemento/portal en orden de recorrido', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'main',
      children: [
        { type: 'element' as const, tag: 'h1', children: [{ type: 'text' as const, content: 'Axiom' }] },
        { type: 'element' as const, tag: 'p', children: [{ type: 'text' as const, content: 'Hydration' }] },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    const markerIndices = [...html.matchAll(/data-axiom-id="(\d+)"/g)].map((match) => Number.parseInt(match[1]!, 10))

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const expected: number[] = []
    forEachNode(prepared, (node) => {
      const nodeType = getNodeType(node)
      if (nodeType === 'element' || nodeType === 'portal') {
        expected.push(getNodeIndex(node))
      }
    })

    expect(markerIndices.length).toBeGreaterThan(0)
    expect(markerIndices).toEqual(expected)
  })

  test('commitHydrate reusa nodos y no reporta mismatch en happy path', () => {
    let clicks = 0
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'section',
      children: [
        {
          type: 'element' as const,
          tag: 'button',
          on: {
            click: () => {
              clicks++
            },
          },
          children: [{ type: 'text' as const, content: 'Tap' }],
        },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()
    const before = root.getElementsByTagName('button')[0] ?? null
    expect(before).not.toBeNull()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    const result = commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    expect(result.mismatchCount).toBe(0)
    expect(result.hydratedNodeCount).toBeGreaterThan(0)
    expect(root.getElementsByTagName('button')[0] ?? null).toBe(before)

    ;(root.getElementsByTagName('button')[0] ?? null)?.dispatchEvent(new window.Event('click'))
    expect(clicks).toBe(1)
  })
})

describe('hydration: mismatch classes and modes', () => {
  test('detecta mismatch de tag en modo soft', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'A' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()
    const current = root.firstElementChild as HTMLElement
    const replacement = document.createElement('span')
    replacement.setAttribute('data-axiom-id', current.getAttribute('data-axiom-id') ?? '0')
    replacement.textContent = current.textContent
    current.replaceWith(replacement)

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    const result = commitHydrate(layout, prepared, root, state, { strictMismatch: false })

    expect(result.mismatchCount).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('Tag mismatch'))).toBe(true)
  })

  test('detecta mismatch de texto en modo soft', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'hola' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()
    root.firstElementChild!.textContent = 'HOLA'

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    const result = commitHydrate(layout, prepared, root, state, { strictMismatch: false })

    expect(result.mismatchCount).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('Text mismatch'))).toBe(true)
  })

  test('detecta mismatch de cantidad de hijos en modo soft', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'A' }] },
        { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'B' }] },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()
    root.firstElementChild?.lastElementChild?.remove()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    const result = commitHydrate(layout, prepared, root, state, { strictMismatch: false })

    expect(result.mismatchCount).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('Children count mismatch'))).toBe(true)
  })

  test('modo strict lanza en el primer mismatch', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'strict' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()
    root.firstElementChild!.textContent = 'STRICT'

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    expect(() => {
      commitHydrate(layout, prepared, root, state, { strictMismatch: true })
    }).toThrow()
  })
})

describe('hydration: portals, debug and deep tree', () => {
  test('portal missing: warning con skipMissingPortals=true y throw con false', () => {
    const disconnectedTarget = document.createElement('div')
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'P' }] }],
          disconnectedTarget
        ),
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })

    const softState = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    const soft = commitHydrate(layout, prepared, root, softState, {
      strictMismatch: false,
      skipMissingPortals: true,
    })
    expect(soft.warnings.some(w => w.includes('Portal target missing'))).toBe(true)

    const strictState = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    expect(() => {
      commitHydrate(layout, prepared, root, strictState, {
        strictMismatch: true,
        skipMissingPortals: false,
      })
    }).toThrow('Portal target missing')
  })

  test('debug=true exporta payload de depuración global', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'debug' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    const result = commitHydrate(layout, prepared, root, state, { debug: true })
    expect(result.mismatchCount).toBe(0)

    const debugPayload = (globalThis as { __AXIOM_HYDRATION_DEBUG__?: Record<string, unknown> }).__AXIOM_HYDRATION_DEBUG__
    expect(debugPayload).toBeDefined()
    expect(debugPayload?.mismatchCount).toBe(0)
    expect(debugPayload?.hydratedNodeCount).toBeGreaterThan(0)
  })

  test('árbol profundo 50+ nodos hidrata sin mismatches', () => {
    const depth = 60
    const App = defineComponent(() => {
      let current: ComponentNode = {
        type: 'element' as const,
        tag: 'div',
        children: [{ type: 'text' as const, content: 'root' }],
      }

      for (let i = 0; i < depth; i++) {
        current = {
          type: 'element' as const,
          tag: 'div',
          children: [current],
        }
      }

      return current
    })

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 1200 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    const result = commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    expect(result.mismatchCount).toBe(0)
    expect(result.hydratedNodeCount).toBeGreaterThanOrEqual(depth)
  })
})

describe('hydration: layout resets applied by commitHydrate', () => {
  test('commitHydrate applies framework layout styles even when DOM was built without SSR', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello' }],
    }))

    // Build DOM manually WITHOUT SSR resets (no box-sizing/margin/padding)
    installWindow()
    const root = document.createElement('div')
    root.id = 'app'
    document.body.appendChild(root)
    const el = document.createElement('div')
    el.setAttribute('data-axiom-id', '0')
    // Intentionally do NOT set any style
    root.appendChild(el)

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
    commitHydrate(layout, prepared, root, state)

    // After commitHydrate, framework layout styles should be applied
    const hydratedEl = root.children[0] as HTMLElement | undefined
    expect(hydratedEl).not.toBeUndefined()
    const style = hydratedEl?.getAttribute('style') ?? ''
    expect(style).toContain('position')
  })
})