import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { applyOps, commitFull, commitHydrate, type DOMOperation } from '../src/render/commit.js'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { renderToString } from '../src/ssr.js'
import { createApp } from '../src/app.js'

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

    expect(child.style.transform).toBe('translate(100px,50px) var(--animation-transform)')
    expect(child.style.width).toBe('200px')
    expect(child.style.height).toBe('100px')
  })

  test('updates skip framework layout for CSS-managed portal children', () => {
    const root = document.createElement('div')
    const portalTarget = document.createElement('section')
    const child = document.createElement('div')
    portalTarget.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 100, y: 50, width: 200, height: 100, portalTarget },
    ]

    applyOps(ops, root, domNodes)

    expect(child.style.position).toBe('')
    expect(child.style.transform).toBe('')
    expect(child.style.width).toBe('')
    expect(child.style.height).toBe('')
  })

  test('moves skip framework layout for CSS-managed portal children', () => {
    const root = document.createElement('div')
    const portalTarget = document.createElement('section')
    const child = document.createElement('div')
    portalTarget.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'move', oldIndex: 0, index: 1, x: 20, y: 30, width: 40, height: 50, portalTarget },
    ]

    applyOps(ops, root, domNodes)

    expect(child.style.position).toBe('')
    expect(child.style.transform).toBe('')
    expect(domNodes[1]).toBe(child)
  })

  test('updates apply framework layout for cssManaged:false portal children', () => {
    const root = document.createElement('div')
    const portalTarget = document.createElement('section')
    const child = document.createElement('div')
    portalTarget.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 10, y: 20, width: 30, height: 40, portalTarget, portalCssManaged: false },
    ]

    applyOps(ops, root, domNodes)

    expect(child.style.position).toBe('absolute')
    expect(child.style.transform).toBe('translate(10px,20px) var(--animation-transform)')
    expect(child.style.width).toBe('30px')
    expect(child.style.height).toBe('40px')
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

  test('update con newClasses aplica el className correcto al elemento', () => {
    const root = document.createElement('div')
    const child = document.createElement('article')
    child.className = 'card'
    root.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, newClasses: ['card', 'active'] },
    ]

    applyOps(ops, root, domNodes)

    expect(child.className).toBe('card active')
    // Sin coords en el op — no debe haberse aplicado layout
    expect(child.style.transform).toBe('')
    expect(child.style.position).toBe('')
  })

  test('update con newClasses vacío limpia el className', () => {
    const root = document.createElement('div')
    const child = document.createElement('article')
    child.className = 'card active'
    root.appendChild(child)

    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, newClasses: [] },
    ]

    applyOps(ops, root, domNodes)

    expect(child.className).toBe('')
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
    expect(container.style.transform).toBe('translate(0px,0px) var(--animation-transform)')
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

describe('commitHydrate: security hardening', () => {
  test('hydration removes pre-existing onclick attr from DOM element', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'button',
      attrs: {
        title: 'safe',
      },
      children: [{ type: 'text' as const, content: 'Tap' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    const win = new Window()
    globalThis.window = win as unknown as typeof globalThis.window
    globalThis.document = win.document as unknown as Document
    globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
    globalThis.Text = win.Text as unknown as typeof Text
    win.document.write(html)

    const root = document.getElementById('app') as HTMLElement
    const button = root.firstElementChild as HTMLElement
    button.setAttribute('onclick', 'alert(1)')

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 500 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    expect(button.getAttribute('onclick')).toBeNull()
  })

  test('hydration neutralizes javascript: URL scheme to #blocked', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'javascript:alert(1)',
      },
      children: [{ type: 'text' as const, content: 'Link' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    const win = new Window()
    globalThis.window = win as unknown as typeof globalThis.window
    globalThis.document = win.document as unknown as Document
    globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
    globalThis.Text = win.Text as unknown as typeof Text
    win.document.write(html)

    const root = document.getElementById('app') as HTMLElement
    const link = root.firstElementChild as HTMLElement
    link.setAttribute('href', 'javascript:alert(1)')

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 500 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    expect(link.getAttribute('href')).toBe('#blocked')
  })

  test('safe attrs are preserved during hydration', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      attrs: {
        title: 'safe title',
      },
      children: [{ type: 'text' as const, content: 'Content' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    const win = new Window()
    globalThis.window = win as unknown as typeof globalThis.window
    globalThis.document = win.document as unknown as Document
    globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
    globalThis.Text = win.Text as unknown as typeof Text
    win.document.write(html)

    const root = document.getElementById('app') as HTMLElement
    const div = root.firstElementChild as HTMLElement
    div.setAttribute('data-legacy', '1')

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 500 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    expect(div.getAttribute('title')).toBe('safe title')
    expect(div.getAttribute('data-legacy')).toBe('1')
  })
})

// ============================================================
// Transform animation tests (Task 1.2 RED + Task 3.2 GREEN)
// ============================================================

describe('transform animations', () => {
  test('applyOps emits composed transform with var(--animation-transform)', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 50, y: 75, width: 100, height: 200 },
    ]
    applyOps(ops, root, domNodes)

    expect(child.style.transform).toBe('translate(50px,75px) var(--animation-transform)')
  })

  test('onTransformConflict fires synchronously when external transform is detected', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    // Simulate an animation library writing a conflicting transform
    child.style.transform = 'scale(0.95)'
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    const conflictCalls: Array<{ el: HTMLElement; transform: string }> = []
    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 10, y: 20, width: 100, height: 50 },
    ]

    applyOps(ops, root, domNodes, {
      onTransformConflict: (el, animationTransform) => {
        conflictCalls.push({ el, transform: animationTransform })
      },
    })

    // Hook must have been called exactly once, synchronously, before this line
    expect(conflictCalls.length).toBe(1)
    expect(conflictCalls[0]!.el).toBe(child)
    expect(conflictCalls[0]!.transform).toBe('scale(0.95)')
    // Axiom still writes its composed transform
    expect(child.style.transform).toBe('translate(10px,20px) var(--animation-transform)')
  })

  test('onTransformConflict does NOT fire for elements Axiom wrote previously (no false positive)', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    const conflictCalls: number[] = []

    // First write — establishes Axiom ownership
    applyOps([{ type: 'update', index: 0, x: 10, y: 20, width: 100, height: 50 }], root, domNodes, {
      onTransformConflict: () => conflictCalls.push(1),
    })
    expect(conflictCalls.length).toBe(0)

    // Second write — same Axiom ownership, no external conflict
    applyOps([{ type: 'update', index: 0, x: 15, y: 25, width: 100, height: 50 }], root, domNodes, {
      onTransformConflict: () => conflictCalls.push(1),
    })
    expect(conflictCalls.length).toBe(0)
  })

  test('!important transform: hook fires but Axiom does not overwrite', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    // Simulate a user keyframe applying transform with !important
    child.style.setProperty('transform', 'rotate(45deg)', 'important')
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    const conflictCalls: string[] = []
    applyOps([{ type: 'update', index: 0, x: 5, y: 10, width: 100, height: 50 }], root, domNodes, {
      onTransformConflict: (_el, t) => conflictCalls.push(t),
    })

    // Hook must fire
    expect(conflictCalls.length).toBe(1)
    expect(conflictCalls[0]).toBe('rotate(45deg)')
    // The !important value must survive — Axiom must not overwrite it
    expect(child.style.transform).toBe('rotate(45deg)')
    expect(child.style.getPropertyPriority('transform')).toBe('important')
  })

  test('non-animated elements preserve x/y/width/height layout math', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'static' }],
    }))
    const prepared = prepare(comp, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 400, maxHeight: 800 }, { lineHeight: 20 })
    const root = document.createElement('div')
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    const el = root.children[0] as HTMLElement
    expect(el.style.position).toBe('absolute')
    expect(el.style.width).toBe('400px')
    // Transform must still be the composed form even without animation
    expect(el.style.transform).toContain('translate(')
    expect(el.style.transform).toContain('var(--animation-transform)')
  })

  test('createApp with onTransformConflict — hook receives element and prior transform (applyOps direct)', () => {
    const root = document.createElement('div')

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [],
    }))

    const app = createApp(App, root, {
      textEngine: fakeTextEngine,
    })
    app.mount()

    // After mount, find the Axiom-managed child via DOM traversal
    const child = root.firstElementChild as HTMLElement
    expect(child).not.toBeNull()

    // Simulate an external write (e.g. animation library) on the child
    child.style.transform = 'scale(0.5)'

    // Call applyOps directly with this element — mimics an incremental update
    const conflictArgs: Array<{ el: HTMLElement; transform: string }> = []
    const domNodes = [child] as (HTMLElement | Text | null)[]
    const ops: DOMOperation[] = [
      { type: 'update', index: 0, x: 0, y: 0, width: 100, height: 50 },
    ]
    applyOps(ops, root, domNodes, {
      onTransformConflict: (el, t) => conflictArgs.push({ el, transform: t }),
    })

    expect(conflictArgs.length).toBe(1)
    expect(conflictArgs[0]!.el).toBe(child)
    expect(conflictArgs[0]!.transform).toBe('scale(0.5)')

    app.unmount()
  })

  // ── fill-mode: both ──────────────────────────────────────────────────────
  // Spec scenario: Element with fill-mode both
  // GIVEN an element positioned by Axiom layout
  // WHEN a CSS animation with animation-fill-mode: both animates --animation-transform
  // THEN the element MUST render using both Axiom's layout translate and the animation transform
  test('fill-mode: both — composed transform includes Axiom translate AND --animation-transform CSS var', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    // Simulate a CSS animation that sets --animation-transform (fill-mode: both applies
    // the value before and after the animation, at computed style level)
    child.style.setProperty('--animation-transform', 'rotate(45deg)')
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    applyOps([{ type: 'update', index: 0, x: 120, y: 240, width: 300, height: 150 }], root, domNodes)

    // The inline transform must embed the Axiom translate so fill-mode: both can
    // compose both values at the CSS computed-style level in a real browser.
    expect(child.style.transform).toBe('translate(120px,240px) var(--animation-transform)')
    // Axiom's positional coordinates are present
    expect(child.style.transform).toContain('translate(120px,240px)')
    // The CSS variable reference is the composition point for the animation value
    expect(child.style.transform).toContain('var(--animation-transform)')
  })

  // ── fill-mode: forwards ──────────────────────────────────────────────────
  // Spec scenario: Element with fill-mode forwards
  // GIVEN an element positioned by Axiom layout
  // WHEN a CSS animation with animation-fill-mode: forwards animates --animation-transform
  // THEN the Axiom layout translate MUST be preserved after the animation completes
  test('fill-mode: forwards — Axiom layout translate is preserved after animation completes', () => {
    const root = document.createElement('div')
    const child = document.createElement('div')
    root.appendChild(child)
    const domNodes: (HTMLElement | Text | null)[] = [child]

    // First Axiom layout write — establishes ownership
    applyOps([{ type: 'update', index: 0, x: 50, y: 100, width: 200, height: 80 }], root, domNodes)
    expect(child.style.transform).toBe('translate(50px,100px) var(--animation-transform)')

    // Simulate animation end with fill-mode: forwards:
    // the final keyframe holds --animation-transform at its last value.
    child.style.setProperty('--animation-transform', 'translateX(20px)')

    // Axiom processes a layout update (e.g. parent resized, new coordinates)
    applyOps([{ type: 'update', index: 0, x: 60, y: 110, width: 200, height: 80 }], root, domNodes)

    // Axiom translate MUST reflect the new layout coordinates — not the stale ones
    expect(child.style.transform).toContain('translate(60px,110px)')
    // The CSS variable reference MUST still be present so fill-mode: forwards value persists
    expect(child.style.transform).toContain('var(--animation-transform)')
    // Full composed string check
    expect(child.style.transform).toBe('translate(60px,110px) var(--animation-transform)')
  })

  // ── createApp({ onTransformConflict }) end-to-end wiring ─────────────────
  // Proves the option travels: createApp(opts) → commitOpts → performUpdate → applyOps
  // using the real scheduler capture pattern to invoke performUpdate synchronously.
  test('createApp({ onTransformConflict }) wires hook through performUpdate → applyOps', () => {
    const root = document.createElement('div')
    const conflictCalls: Array<{ el: HTMLElement; transform: string }> = []

    // Non-reactive text captured by closure; changing it makes prepare() return
    // a new VNode with different text length → reflow produces different height →
    // fullDiff detects layout change → update op carries x/y → applyFrameworkLayout runs.
    let labelText = 'A'

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: labelText }],
    }))

    // Synchronous capturing scheduler: holds performUpdate without running it yet.
    let scheduledRender: (() => void) | null = null

    const app = createApp(App, root, {
      textEngine: fakeTextEngine,
      scheduler: (fn) => { scheduledRender = fn },
      onTransformConflict: (el, t) => conflictCalls.push({ el, transform: t }),
    })

    app.mount()

    // mount() runs commitFull (first render) then wires the effect which captures
    // performUpdate via the scheduler above.
    const child = root.firstElementChild as HTMLElement
    expect(child).not.toBeNull()
    expect(scheduledRender).not.toBeNull()

    // Inject a conflicting transform — simulates an animation library writing
    // to transform instead of --animation-transform.
    child.style.transform = 'scale(0.9)'

    // Force a layout change by growing the text beyond one line so that reflow
    // produces a different height for the element.
    // fakeTextEngine: charsPerLine = floor(800/6) = 133; 200 chars → 2 lines → height 40
    // Previous height was 20 (1 line). fullDiff detects height change → layout update op.
    labelText = 'A'.repeat(200)

    // Run the captured performUpdate — the real app commit path executes with commitOpts.
    scheduledRender!()

    // The hook MUST have fired through the real createApp → performUpdate → applyOps path.
    expect(conflictCalls.length).toBe(1)
    expect(conflictCalls[0]!.el).toBe(child)
    expect(conflictCalls[0]!.transform).toBe('scale(0.9)')

    app.unmount()
  })
})
