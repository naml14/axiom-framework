import { describe, test, expect, beforeEach, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { createPortal } from '../src/portal.js'
import { prepare, resetIndexCounter, getNodeIndex, getNodeType, getPreparedChildren } from '../src/prepare.js'
import { reflow } from '../src/reflow.js'
import { commitFull } from '../src/commit.js'
import type { DOMState } from '../src/commit.js'
import { defineComponent } from '../src/component.js'
import { signal } from '../src/signals.js'
import { createApp } from '../src/app.js'
import { resetScheduler } from '../src/scheduler.js'
import type { PortalNode, ElementNode } from '../src/types.js'
import { fullDiff } from '../src/diff.js'

// ============================================================
// DOM setup for commit/app tests
// ============================================================

beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0)
    return 0
  }) as typeof requestAnimationFrame
})

// ============================================================
// Phase 1: Factory tests (Task 1.1)
// ============================================================

describe('createPortal factory', () => {
  let target: HTMLElement

  beforeEach(() => {
    target = { tagName: 'DIV' } as unknown as HTMLElement
  })

  test('returns a node with type "portal"', () => {
    const children = [{ type: 'text' as const, content: 'hello' }]
    const portal = createPortal(children, target)

    expect(portal.type).toBe('portal')
  })

  test('stores the target element reference', () => {
    const children = [{ type: 'text' as const, content: 'hello' }]
    const portal = createPortal(children, target)

    expect(portal.target).toBe(target)
  })

  test('stores the children array', () => {
    const children = [
      { type: 'text' as const, content: 'a' },
      { type: 'text' as const, content: 'b' },
    ]
    const portal = createPortal(children, target)

    expect(portal.children).toBe(children)
    expect(portal.children).toHaveLength(2)
  })

  test('different targets produce independent portals', () => {
    const targetA = { tagName: 'DIV', id: 'a' } as unknown as HTMLElement
    const targetB = { tagName: 'DIV', id: 'b' } as unknown as HTMLElement

    const portalA = createPortal([{ type: 'text' as const, content: 'A' }], targetA)
    const portalB = createPortal([{ type: 'text' as const, content: 'B' }], targetB)

    expect(portalA.target).toBe(targetA)
    expect(portalB.target).toBe(targetB)
    expect(portalA.target).not.toBe(portalB.target)
  })

  test('empty children array is accepted', () => {
    const portal = createPortal([], target)

    expect(portal.type).toBe('portal')
    expect(portal.children).toHaveLength(0)
  })

  test('returned object satisfies PortalNode shape', () => {
    const children = [{ type: 'text' as const, content: 'hello' }]
    const portal = createPortal(children, target)

    // Type narrowing: if these pass, the shape is correct
    const p = portal as PortalNode
    expect(p.type).toBe('portal')
    expect(p.target).toBe(target)
    expect(p.children).toHaveLength(1)
  })
})

// ============================================================
// Phase 2: Prepare + Reflow pipeline tests (Task 2.1)
// ============================================================

describe('prepare — portal node', () => {
  let target: HTMLElement

  beforeEach(() => {
    resetIndexCounter()
    target = { tagName: 'DIV' } as unknown as HTMLElement
  })

  test('portal node gets an _index allocated by prepare', () => {
    // A root element containing a portal child
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal([{ type: 'text' as const, content: 'portal text' }], target),
      ],
    }))

    const prepared = prepare(component, undefined)
    // Root element is at index 0; portal is its first child at index 1
    const rootChildren = getPreparedChildren(prepared)
    expect(rootChildren).toHaveLength(1)

    const portalPrepared = rootChildren[0]
    const portalIdx = getNodeIndex(portalPrepared)
    expect(portalIdx).toBe(1)
  })

  test('portal nodeType is "portal" after prepare', () => {
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal([{ type: 'text' as const, content: 'hello' }], target),
      ],
    }))

    const prepared = prepare(component, undefined)
    const rootChildren = getPreparedChildren(prepared)
    const portalPrepared = rootChildren[0]

    expect(getNodeType(portalPrepared)).toBe('portal')
  })

  test('portal children are recursed and also get indices', () => {
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'text' as const, content: 'child text' }],
          target
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const rootChildren = getPreparedChildren(prepared)
    const portalPrepared = rootChildren[0]
    const portalChildren = getPreparedChildren(portalPrepared)

    expect(portalChildren).toHaveLength(1)
    // Portal is at index 1, its text child at index 2
    expect(getNodeIndex(portalChildren[0])).toBe(2)
  })
})

describe('reflow — portal layout', () => {
  let target: HTMLElement

  beforeEach(() => {
    resetIndexCounter()
    target = { tagName: 'DIV' } as unknown as HTMLElement
  })

  test('portal node gets 0×0 layout dimensions', () => {
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal([{ type: 'text' as const, content: 'hi' }], target),
      ],
    }))

    const prepared = prepare(component, undefined)
    const result = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const rootChildren = getPreparedChildren(prepared)
    const portalPrepared = rootChildren[0]
    const portalIdx = getNodeIndex(portalPrepared)

    // Portal slot must be 0×0 — it must not occupy space in parent layout
    expect(result.width[portalIdx]).toBe(0)
    expect(result.height[portalIdx]).toBe(0)
  })

  test('sibling nodes after a portal maintain correct positions', () => {
    // Layout: root (div) → [portal, text]
    // The text sibling must NOT be affected by the portal's 0×0 slot
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal([{ type: 'text' as const, content: 'portal content' }], target),
        { type: 'text' as const, content: 'sibling text' },
      ],
    }))

    const prepared = prepare(component, undefined)
    const result = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const rootChildren = getPreparedChildren(prepared)
    // rootChildren = [portal (idx 1), text (idx 2)]
    const textSibling = rootChildren[1]
    const textIdx = getNodeIndex(textSibling)

    // The sibling text node must have a real height (non-zero after layout)
    expect(result.height[textIdx]).toBeGreaterThan(0)

    // The sibling y-position must be 0 — the portal did not shift it down
    expect(result.y[textIdx]).toBe(0)
  })

  test('sibling before AND after portal both get correct layout', () => {
    // root (div) → [text-a, portal, text-b]
    const textA: ElementNode = { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'A' }] }
    const textB: ElementNode = { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'B' }] }

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        textA,
        createPortal([{ type: 'text' as const, content: 'hidden' }], target),
        textB,
      ],
    }))

    const prepared = prepare(component, undefined)
    const result = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const rootChildren = getPreparedChildren(prepared)
    // root=0, textA=1, portal=2, textB=3+

    const textAIdx = getNodeIndex(rootChildren[0])
    const portalIdx = getNodeIndex(rootChildren[1])
    const textBIdx = getNodeIndex(rootChildren[2])

    // Portal is 0×0
    expect(result.width[portalIdx]).toBe(0)
    expect(result.height[portalIdx]).toBe(0)

    // Both sibling spans have positive width
    expect(result.width[textAIdx]).toBeGreaterThan(0)
    expect(result.width[textBIdx]).toBeGreaterThan(0)
  })
})

// ============================================================
// Bug B — fixPortalSlots: portal siblings in flex row layout
// ============================================================

describe('Bug B — portal in flex row does not displace siblings', () => {
  let target: HTMLElement

  beforeEach(() => {
    resetIndexCounter()
    target = { tagName: 'DIV' } as unknown as HTMLElement
  })

  test('flex row with two normal children and a portal: normal children have y=0 and correct x', () => {
    // root (div, flexDirection:'row') → [span-a, portal, span-b]
    // span-a and span-b must both have y=0 and x values based only on their sizes
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row' as const },
      children: [
        { type: 'element' as const, tag: 'span', layout: { width: 100, height: 50 }, children: [] },
        createPortal([{ type: 'text' as const, content: 'portal text' }], target),
        { type: 'element' as const, tag: 'span', layout: { width: 100, height: 50 }, children: [] },
      ],
    }))

    const prepared = prepare(component, undefined)
    const result = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const rootChildren = getPreparedChildren(prepared)
    // root=0, spanA=1, portal=2, spanB=3
    const spanAIdx = getNodeIndex(rootChildren[0]!)
    const portalIdx = getNodeIndex(rootChildren[1]!)
    const spanBIdx = getNodeIndex(rootChildren[2]!)

    // Portal must be 0×0
    expect(result.width[portalIdx]).toBe(0)
    expect(result.height[portalIdx]).toBe(0)

    // Both spans at y=0 (flex row)
    expect(result.y[spanAIdx]).toBe(0)
    expect(result.y[spanBIdx]).toBe(0)

    // spanA at x=0, spanB at x=100 (right after spanA, portal contributes nothing)
    expect(result.x[spanAIdx]).toBe(0)
    expect(result.x[spanBIdx]).toBe(100)
  })

  test('justifyContent:center with a portal child: non-portal siblings are centered correctly', () => {
    // root (div, flexDirection:'row', justifyContent:'center', width:400) → [span-a, portal, span-b]
    // Each span is 50px wide. Total real content = 100px. Center offset = (400-100)/2 = 150px
    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { flexDirection: 'row' as const, justifyContent: 'center' as const, width: 400, height: 100 },
      children: [
        { type: 'element' as const, tag: 'span', layout: { width: 50, height: 40 }, children: [] },
        createPortal([{ type: 'text' as const, content: 'modal' }], target),
        { type: 'element' as const, tag: 'span', layout: { width: 50, height: 40 }, children: [] },
      ],
    }))

    const prepared = prepare(component, undefined)
    const result = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const rootChildren = getPreparedChildren(prepared)
    const spanAIdx = getNodeIndex(rootChildren[0]!)
    const spanBIdx = getNodeIndex(rootChildren[2]!)

    // With centering and no portal influence: spanA at x=150, spanB at x=200
    expect(result.x[spanAIdx]).toBe(150)
    expect(result.x[spanBIdx]).toBe(200)
  })
})

// ============================================================
// Phase 3: Commit — portal DOM rendering (Task 3.1)
// ============================================================

describe('commitFull — portal children appended to targetElement', () => {
  beforeEach(() => {
    resetIndexCounter()
  })

  test('portal children are appended to targetElement, not the parent container', () => {
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    // The portal child <span> must be in targetEl, NOT in root
    expect(targetEl.childNodes.length).toBe(1)
    expect((targetEl.childNodes[0] as HTMLElement).tagName).toBe('SPAN')
    // Root must NOT contain the portal child — root only has the host div
    // (portal slot is 0×0 and the span is in targetEl)
    const rootDiv = root.childNodes[0] as HTMLElement
    expect(rootDiv.tagName).toBe('DIV')
    expect(rootDiv.childNodes.length).toBe(0)
  })

  test('two portals to two different targets each receive their own children', () => {
    const targetA = document.createElement('section')
    const targetB = document.createElement('aside')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetA
        ),
        createPortal(
          [{ type: 'element' as const, tag: 'p', children: [] }],
          targetB
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    // targetA gets the <span>
    expect(targetA.childNodes.length).toBe(1)
    expect((targetA.childNodes[0] as HTMLElement).tagName).toBe('SPAN')

    // targetB gets the <p>
    expect(targetB.childNodes.length).toBe(1)
    expect((targetB.childNodes[0] as HTMLElement).tagName).toBe('P')

    // Root only has the host div; portal children are in their respective targets
    const hostDiv = root.childNodes[0] as HTMLElement
    expect(hostDiv.tagName).toBe('DIV')
    expect(hostDiv.childNodes.length).toBe(0)
  })

  test('portal with empty children adds nothing to targetElement', () => {
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal([], targetEl),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    expect(targetEl.childNodes.length).toBe(0)
  })

  test('two portals targeting the same element both append their children in render order', () => {
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
        createPortal(
          [{ type: 'element' as const, tag: 'em', children: [] }],
          targetEl
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    // targetEl must contain children from BOTH portals
    expect(targetEl.childNodes.length).toBe(2)
    // Render order: first portal's child (span) before second portal's child (em)
    expect((targetEl.childNodes[0] as HTMLElement).tagName).toBe('SPAN')
    expect((targetEl.childNodes[1] as HTMLElement).tagName).toBe('EM')
  })

  test('portalRoots map is populated with portal index → targetElement', () => {
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    // portalRoots must have one entry tracking the targetElement
    expect(state.portalRoots.size).toBe(1)
    const [entry] = [...state.portalRoots.values()]
    expect(entry!.target).toBe(targetEl)
    // nodes array must contain the span that was appended to targetEl
    expect(entry!.nodes).toHaveLength(1)
  })
})

// ============================================================
// Phase 4: Unmount & Reactivity (Task 4.1)
// ============================================================

describe('app unmount — portal DOM cleanup', () => {
  const syncScheduler = (cb: () => void) => cb()

  test('unmounting the app removes portal children from targetElement', () => {
    resetScheduler()
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ],
    }))

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    // Verify portal content is in targetEl after mount
    expect(targetEl.childNodes.length).toBe(1)

    app.unmount()

    // After unmount, targetEl must be empty
    expect(targetEl.childNodes.length).toBe(0)
  })

  test('unmounting removes portal DOM and does not affect root', () => {
    resetScheduler()
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'element' as const, tag: 'p', children: [] },
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ],
    }))

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    expect(targetEl.childNodes.length).toBe(1)

    app.unmount()

    expect(targetEl.childNodes.length).toBe(0)
    // Root also cleared
    expect(root.childNodes.length).toBe(0)
  })
})

describe('app shape change — portal DOM cleanup before re-render', () => {
  const syncScheduler = (cb: () => void) => cb()

  test('shape change clears old portal DOM in targetElement before writing new content', () => {
    resetScheduler()
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    // Toggle signal to cause a shape change (different child count)
    const showExtra = signal(false, { kind: 'shape' })

    const comp = defineComponent(() => {
      const children: ReturnType<typeof createPortal>[] = [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ]
      if (showExtra.value) {
        children.push(
          createPortal(
            [{ type: 'element' as const, tag: 'em', children: [] }],
            targetEl
          )
        )
      }
      return {
        type: 'element' as const,
        tag: 'div',
        children,
      }
    })

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    // Initially one portal child in targetEl
    expect(targetEl.childNodes.length).toBe(1)
    expect((targetEl.childNodes[0] as HTMLElement).tagName).toBe('SPAN')

    // Shape change: now two portals → targetEl gets two children
    showExtra.value = true

    // After shape change + re-render: old portal content cleared, new content written
    // targetEl should have exactly 2 children (SPAN + EM) — no duplicates from stale DOM
    expect(targetEl.childNodes.length).toBe(2)

    app.unmount()
  })
})

// ============================================================
// PR #8 Bug fixes — RED tests (must fail before fix)
// ============================================================

describe('Bug A1 — portal cleanup does not nuke external DOM', () => {
  const syncScheduler = (cb: () => void) => cb()

  test('unmounting with body-like target does not remove unrelated children from that target', () => {
    resetScheduler()
    // Use a dedicated container that simulates document.body (holds unrelated children)
    const portalTarget = document.createElement('div')

    // Survivor element that Axiom did NOT create — must survive unmount
    const survivor = document.createElement('p')
    portalTarget.appendChild(survivor)

    const root = document.createElement('div')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          portalTarget
        ),
      ],
    }))

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    // After mount: portalTarget has survivor + span (2 children)
    expect(portalTarget.childNodes.length).toBe(2)

    app.unmount()

    // After unmount: only the survivor must remain — Axiom must remove only what it added
    expect(portalTarget.childNodes.length).toBe(1)
    expect(portalTarget.childNodes[0]).toBe(survivor)
  })
})

describe('Bug A2 — portal direct children are CSS-managed (no Axiom layout positions)', () => {
  test('portal direct children have 0×0 layout — CSS owns their positioning', () => {
    resetIndexCounter()
    const target = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [
            { type: 'element' as const, tag: 'div', children: [{ type: 'text' as const, content: 'first' }] },
            { type: 'element' as const, tag: 'div', children: [{ type: 'text' as const, content: 'second' }] },
          ],
          target
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    // Get the portal and its children
    const rootChildren = getPreparedChildren(prepared)
    const portalPrepared = rootChildren[0]!
    const portalChildren = getPreparedChildren(portalPrepared)

    const firstIdx = getNodeIndex(portalChildren[0]!)
    const secondIdx = getNodeIndex(portalChildren[1]!)

    // Portal children are CSS-managed: Axiom assigns 0×0 (no layout interference).
    // The CSS classes (e.g. position:fixed, display:flex) own the actual positioning.
    expect(layout.x[firstIdx]).toBe(0)
    expect(layout.y[firstIdx]).toBe(0)
    expect(layout.width[firstIdx]).toBe(0)
    expect(layout.height[firstIdx]).toBe(0)

    expect(layout.x[secondIdx]).toBe(0)
    expect(layout.y[secondIdx]).toBe(0)
    expect(layout.width[secondIdx]).toBe(0)
    expect(layout.height[secondIdx]).toBe(0)
  })

  test('portal direct children are appended to the target DOM without inline position styles', () => {
    resetIndexCounter()
    const target = document.createElement('div')
    const root = document.createElement('div')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [
            { type: 'element' as const, tag: 'div', children: [] },
            { type: 'element' as const, tag: 'div', children: [] },
          ],
          target
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    commitFull(layout, prepared, root, state)

    // Both portal children are in the target element
    expect(target.childNodes.length).toBe(2)

    // No inline position styles applied (CSS-managed)
    const first = target.childNodes[0] as HTMLElement
    const second = target.childNodes[1] as HTMLElement
    expect(first.style.position).toBe('')
    expect(first.style.transform).toBe('')
    expect(second.style.position).toBe('')
    expect(second.style.transform).toBe('')
  })
})


describe('Bug A3 — fullDiff insert ops for portal descendants carry portalTarget', () => {
  test('fullDiff first-render path: insert ops for portal element children have portalTarget set', () => {
    resetIndexCounter()
    const targetEl = document.createElement('section')

    const component = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'element' as const, tag: 'span', children: [] }],
          targetEl
        ),
      ],
    }))

    const prepared = prepare(component, undefined)
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })

    const ops = fullDiff(null, null, prepared, layout, [])

    // The insert op for the portal child (span) must have portalTarget set
    const insertOps = ops.filter(op => op.type === 'insert' && op.tag === 'span')
    expect(insertOps).toHaveLength(1)
    expect(insertOps[0]!.portalTarget).toBe(targetEl)
  })
})

describe('portal reactivity — signal update inside portal', () => {
  const syncScheduler = (cb: () => void) => cb()

  test('updating a signal inside a portal updates the DOM inside targetElement', () => {
    resetScheduler()
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const text = signal('initial')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'text' as const, content: text.value }],
          targetEl
        ),
      ],
    }))

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    // Initial render: targetEl has a text node with "initial"
    expect(targetEl.childNodes.length).toBe(1)
    expect((targetEl.childNodes[0] as Text).nodeValue).toBe('initial')

    // Update the signal
    text.value = 'updated'

    // The text node inside targetEl must reflect the new value
    expect(targetEl.childNodes.length).toBe(1)
    expect((targetEl.childNodes[0] as Text).nodeValue).toBe('updated')

    app.unmount()
  })

  test('signal update in portal does not affect root container content', () => {
    resetScheduler()
    const targetEl = document.createElement('section')
    const root = document.createElement('div')

    const text = signal('hello')

    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        createPortal(
          [{ type: 'text' as const, content: text.value }],
          targetEl
        ),
        { type: 'element' as const, tag: 'p', children: [] },
      ],
    }))

    const app = createApp(comp, root, { scheduler: syncScheduler })
    app.mount()

    const rootChildCount = root.childNodes.length

    text.value = 'world'

    // Root structure unchanged — same number of children
    expect(root.childNodes.length).toBe(rootChildCount)
    // targetEl has updated content
    expect((targetEl.childNodes[0] as Text).nodeValue).toBe('world')

    app.unmount()
  })
})
