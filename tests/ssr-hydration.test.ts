import { describe, test, expect, beforeEach } from 'bun:test'
import { Window } from 'happy-dom'
import {
  defineComponent,
  renderToString,
  prepare,
  reflow,
  commitHydrate,
  createApp,
} from '../src/index.js'

// ============================================================
// Shared test helpers (mirroring tests/hydration.test.ts)
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
})

// ============================================================
// Spec: Transform String Contract
//
// Requirement: During SSR and hydration, the system MUST emit
// the identical `translate(Xpx,Ypx) var(--animation-transform)`
// string to preserve layout and animation slots.
// Tests MUST assert this exact string using happy-dom, avoiding
// parsed CSS values (happy-dom does not resolve var() or keyframes).
// ============================================================

describe('SSR → hydration: transform string contract', () => {
  // Scenario: SSR output contains the literal composed transform
  test('SSR markup contains translate(Xpx,Ypx) var(--animation-transform) in inline style', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hello SSR' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })

    // The SSR output must embed the composed transform contract literally.
    // This is the "layout slot + animation slot" string the client relies on.
    expect(html).toContain('var(--animation-transform)')
    expect(html).toMatch(/translate\(\d+px,\d+px\) var\(--animation-transform\)/)
  })

  // Triangulation: nested component — multiple elements must all carry the contract
  test('all framework-managed children in SSR markup carry the composed transform', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'section',
      children: [
        { type: 'element' as const, tag: 'h1', children: [{ type: 'text' as const, content: 'Title' }] },
        { type: 'element' as const, tag: 'p', children: [{ type: 'text' as const, content: 'Body' }] },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })

    // Every framework element in the tree gets its own layout slot.
    // We expect at least 3 occurrences: section + h1 + p.
    const matches = [...html.matchAll(/translate\(\d+px,\d+px\) var\(--animation-transform\)/g)]
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  // Scenario: SSR to Hydration preservation
  // GIVEN an application rendered on the server with layout transforms
  // WHEN the client hydrates the server-rendered markup
  // THEN the transform string MUST remain `translate(Xpx,Ypx) var(--animation-transform)`
  // AND the layout and animation slots MUST be preserved
  test('hydrated element preserves translate(Xpx,Ypx) var(--animation-transform) after commitHydrate', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'Hydration test' }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    // After hydration, the inline transform MUST be the exact composed string.
    // happy-dom preserves inline values literally — no computed CSS resolution.
    const el = root.firstElementChild as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.transform).toMatch(/^translate\(\d+px,\d+px\) var\(--animation-transform\)$/)
  })

  // Triangulation: two-element tree — child element must also preserve the contract
  test('nested child element preserves transform contract after commitHydrate', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'section',
      children: [
        { type: 'element' as const, tag: 'div', children: [{ type: 'text' as const, content: 'child' }] },
      ],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
    const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }

    commitHydrate(layout, prepared, root, state, { strictMismatch: true })

    // Both the outer section and the inner div must carry the composed transform.
    const section = root.getElementsByTagName('section')[0] as HTMLElement
    const div = root.getElementsByTagName('div')[0] as HTMLElement
    expect(section.style.transform).toMatch(/^translate\(\d+px,\d+px\) var\(--animation-transform\)$/)
    expect(div.style.transform).toMatch(/^translate\(\d+px,\d+px\) var\(--animation-transform\)$/)
  })
})

// ============================================================
// Spec: Transform Conflict Hook
//
// Requirement: The `onTransformConflict` hook MUST fire correctly
// when an animation update conflicts with an existing transform
// during a hydration update cycle.
// ============================================================

describe('SSR → hydration: onTransformConflict hook', () => {
  // Scenario: Hydration update causes transform conflict
  // GIVEN a hydrated application
  // WHEN an update cycle attempts to apply an animation that clobbers the existing transform
  // THEN the `onTransformConflict` hook MUST fire to handle the collision
  test('hook fires when post-hydration update encounters conflicting external transform', () => {
    // Non-reactive label captured by closure; changing it forces a different layout
    // via prepare() → reflow() → fullDiff() → layout update op → applyFrameworkLayout
    let labelText = 'A'

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: labelText }],
    }))

    // Render SSR markup and install it into happy-dom
    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const conflictCalls: Array<{ el: HTMLElement; transform: string }> = []
    let scheduledRender: (() => void) | null = null

    // Synchronous capturing scheduler: holds performUpdate without running it yet.
    // This lets the test inject the external transform before the update runs.
    const app = createApp(App, root, {
      textEngine: fakeTextEngine,
      hydrate: true,
      scheduler: (fn) => { scheduledRender = fn },
      onTransformConflict: (el, t) => conflictCalls.push({ el: el as HTMLElement, transform: t }),
    })

    app.mount()

    // After hydration, get the framework-managed child
    const child = root.firstElementChild as HTMLElement
    expect(child).not.toBeNull()
    expect(scheduledRender).not.toBeNull()

    // Reset baseline: during commitHydrate, the SSR-written transform is treated as
    // "unowned" by the client Axiom instance (AXIOM_TRANSFORM_OWNED symbol is not set
    // on SSR elements). The hook fires once for the SSR transform during mount.
    // We clear it here to isolate the post-hydration update behavior described in the spec:
    //   "GIVEN a hydrated application WHEN an update cycle conflicts THEN the hook fires"
    conflictCalls.length = 0

    // Simulate an animation library writing to `transform` (the conflicting property)
    // instead of `--animation-transform` (the correct composition point)
    child.style.transform = 'scale(0.8)'

    // Force a layout change: grow text beyond one line so fullDiff emits a layout update op.
    // fakeTextEngine: charsPerLine = floor(800/6) = 133; 200 chars → 2 lines → height 40
    // Previous height was 20 (1 line). fullDiff detects height change → layout update op.
    labelText = 'A'.repeat(200)

    // Run the captured performUpdate — the real app commit path with onTransformConflict wired
    scheduledRender!()

    // The hook MUST fire exactly once through the createApp → performUpdate → applyOps path
    expect(conflictCalls.length).toBe(1)
    expect(conflictCalls[0]!.el).toBe(child)
    expect(conflictCalls[0]!.transform).toBe('scale(0.8)')

    app.unmount()
  })

  // Triangulation: no external conflict → hook must NOT fire
  test('hook does not fire when no external transform conflict exists after hydration', () => {
    let labelText = 'Hello'

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: labelText }],
    }))

    const html = renderToString(App, { textEngine: fakeTextEngine })
    installWindow(html)
    const root = getHydrationRoot()

    const conflictCalls: number[] = []
    let scheduledRender: (() => void) | null = null

    const app = createApp(App, root, {
      textEngine: fakeTextEngine,
      hydrate: true,
      scheduler: (fn) => { scheduledRender = fn },
      onTransformConflict: () => conflictCalls.push(1),
    })

    app.mount()

    // Reset baseline: hook fires once during commitHydrate for the SSR-written transform
    // (unowned by client instance). Clear it to isolate the post-hydration update behavior.
    conflictCalls.length = 0

    // No external transform injection — Axiom now owns the transform value after hydration
    // Grow text to force a layout change so a real update op is emitted
    labelText = 'Hello'.repeat(50)
    scheduledRender!()

    // Hook MUST NOT fire — no conflicting external transform was written post-hydration
    expect(conflictCalls.length).toBe(0)

    app.unmount()
  })
})
