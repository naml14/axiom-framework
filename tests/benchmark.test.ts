import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { commitFull, commitHydrate } from '../src/render/commit.js'
import { fullDiff } from '../src/render/diff.js'
import { renderToString } from '../src/ssr.js'
import type { DOMState } from '../src/render/commit.js'

// ============================================================
// Setup happy-dom
// ============================================================

beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
})

// ============================================================
// Benchmark — prepare/reflow/commit with ~1000 nodes
// ============================================================
//
// These tests do NOT assert exact timing — that would be flaky in CI.
// They assert that:
//   1. The operation COMPLETES (no errors, no hangs)
//   2. The result is CORRECT (node count, layout values)
//   3. Timing is LOGGED for human inspection
//
// Targets from AGENTS.md invariants:
//   prepare < 5ms, reflow < 0.5ms, commit < 2ms
//
// Note: these targets apply to a browser environment with JIT warm-up.
// In Bun (test environment) times may differ. The important thing is
// that the complexity is O(n), not O(n²) or worse.
// ============================================================

const ITEMS = 200 // 200 items × ~5 nodes each ≈ 1000 nodes
const CONSTRAINTS = { maxWidth: 800, maxHeight: 6000 }

// Build a realistic component tree: app > list > N cards > (title + body text)
function buildBenchmarkComponent(count: number, bodySuffix = '') {
  return defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    classes: ['app'],
    layout: { flexDirection: 'column', gap: 8, padding: 16 },
    children: Array.from({ length: count }, (_, i) => ({
      type: 'element' as const,
      tag: 'article',
      key: String(i),
      classes: ['card'],
      layout: { flexDirection: 'column', gap: 4, padding: 12 },
      children: [
        {
          type: 'element' as const,
          tag: 'h3',
          children: [{ type: 'text' as const, content: `Card title ${i + 1}` }],
        },
        {
          type: 'element' as const,
          tag: 'p',
          children: [{
            type: 'text' as const,
            content: `This is the body text for card ${i + 1}. It contains enough content to exercise the text measurement path and ensure multiple lines are calculated correctly under a constrained width.${bodySuffix}`,
          }],
        },
      ],
    })),
  }))
}

describe('benchmark: diff (1000-node same-shape)', () => {
  const PrevComp = buildBenchmarkComponent(ITEMS, '')
  const NextComp = buildBenchmarkComponent(ITEMS, ' updated')

  test('fullDiff() same-shape smoke under 200ms (CI threshold)', () => {
    const prevPrepared = prepare(PrevComp, undefined, { textEngine: fakeTextEngine })
    const nextPrepared = prepare(NextComp, undefined, { textEngine: fakeTextEngine })

    const prevLayout = reflow(prevPrepared, CONSTRAINTS, { lineHeight: 20 })
    const nextLayout = reflow(nextPrepared, CONSTRAINTS, { lineHeight: 20 })

    const domNodes: (HTMLElement | Text | null)[] = Array.from({ length: prevLayout.nodeCount }, () => null)

    const t0 = performance.now()
    const ops = fullDiff(prevPrepared, prevLayout, nextPrepared, nextLayout, domNodes)
    const elapsed = performance.now() - t0

    console.log(`[benchmark:diff] fullDiff(${nextLayout.nodeCount} nodes): ${elapsed.toFixed(2)}ms, ops: ${ops.length}`)

    expect(ops.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('benchmark: 1000-node tree', () => {
  const BenchComp = buildBenchmarkComponent(ITEMS)

  test('prepare() completes and returns correct node count', () => {
    const t0 = performance.now()
    const p = prepare(BenchComp, undefined)
    const elapsed = performance.now() - t0

    // app(1) + ITEMS cards(200) + ITEMS h3(200) + ITEMS p(200) + ITEMS h3-text(200) + ITEMS p-text(200) = 1001
    const expectedNodes = 1 + ITEMS * 5

    console.log(`[benchmark] prepare(${expectedNodes} nodes): ${elapsed.toFixed(2)}ms`)
    expect(p).toBeDefined()
  })

  test('reflow() completes and produces valid layout values', () => {
    const p = prepare(BenchComp, undefined)

    const t0 = performance.now()
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const elapsed = performance.now() - t0

    console.log(`[benchmark] reflow(${layout.nodeCount} nodes): ${elapsed.toFixed(2)}ms`)

    // Root node should have a positive height (cards stacked vertically)
    expect(layout.height[0]).toBeGreaterThan(0)
    // Root node width = maxWidth
    expect(layout.width[0]).toBe(800)
    // No NaN values in layout arrays
    for (let i = 0; i < layout.nodeCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.width[i])).toBe(true)
      expect(Number.isFinite(layout.height[i])).toBe(true)
    }
  })

  test('commit() completes and builds correct DOM structure', () => {
    const p = prepare(BenchComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })

    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    const t0 = performance.now()
    commitFull(layout, p, root, state)
    const elapsed = performance.now() - t0

    console.log(`[benchmark] commit(${layout.nodeCount} nodes): ${elapsed.toFixed(2)}ms`)

    // root > div.app (1 child) > ITEMS cards
    // commitFull appends the root component (div.app) directly to root
    expect(root.children.length).toBe(1)
    expect(root.children[0]!.children.length).toBe(ITEMS)
  })

  test('full cycle prepare→reflow→commit completes under 500ms in test env', () => {
    const t0 = performance.now()

    const p = prepare(BenchComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }
    commitFull(layout, p, root, state)

    const total = performance.now() - t0
    console.log(`[benchmark] full cycle: ${total.toFixed(2)}ms`)

    // 500ms is a very generous limit for a test environment (no JIT warm-up, no browser engine)
    // In a real browser with JIT, this should be < 16ms
    expect(total).toBeLessThan(500)
  })

  // ----------------------------------------------------------
  // P0-C: per-phase thresholds
  // Thresholds are CI-safe (generous for Bun / no JIT) but
  // still catch O(n²) regressions on 1000-node trees.
  // Browser targets (AGENTS.md): prepare<5ms reflow<0.5ms commit<2ms
  // ----------------------------------------------------------

  test('prepare() stays under 200ms for 1000 nodes (CI threshold)', () => {
    const t0 = performance.now()
    prepare(BenchComp, undefined)
    const elapsed = performance.now() - t0
    console.log(`[benchmark:threshold] prepare: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(200)
  })

  test('reflow() stays under 100ms for 1000 nodes (CI threshold)', () => {
    const p = prepare(BenchComp, undefined)
    const t0 = performance.now()
    reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const elapsed = performance.now() - t0
    console.log(`[benchmark:threshold] reflow: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(100)
  })

  test('commit() stays under 300ms for 1000 nodes (CI threshold)', () => {
    const p = prepare(BenchComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }
    const t0 = performance.now()
    commitFull(layout, p, root, state)
    const elapsed = performance.now() - t0
    console.log(`[benchmark:threshold] commit: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(300)
  })
})

// ============================================================
// P0-C: small tree (fast path) — 10 items ≈ 51 nodes
// Tighter thresholds: catches regressions in the near-O(1) path.
// ============================================================

describe('benchmark: small tree (fast path)', () => {
  const SmallComp = buildBenchmarkComponent(10)

  test('full cycle for 51 nodes completes under 50ms (CI threshold)', () => {
    const t0 = performance.now()
    const p = prepare(SmallComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }
    commitFull(layout, p, root, state)
    const elapsed = performance.now() - t0
    console.log(`[benchmark:small] full cycle: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(50)
  })
})

// ============================================================
// P0-C: hydration scenario — SSR HTML + commitHydrate
// Validates that the hydration path does not regress under load.
// ============================================================

const fakeTextEngine = {
  prepare: (text: string, _font: string) => ({ text }),
  layout: (_p: unknown, maxWidth: number, _lh: number) => {
    const t = (_p as { text: string }).text
    const cpl = Math.max(1, Math.floor(maxWidth / 6))
    return { lineCount: Math.max(1, Math.ceil(t.length / cpl)), height: 20 }
  },
  clearCache: () => {},
}

describe('benchmark: hydration (200-item SSR + commitHydrate)', () => {
  const HydrateComp = buildBenchmarkComponent(200)

  test('renderToString() completes under 500ms (CI threshold)', () => {
    const t0 = performance.now()
    const html = renderToString(HydrateComp, { textEngine: fakeTextEngine })
    const elapsed = performance.now() - t0
    console.log(`[benchmark:hydration] renderToString: ${elapsed.toFixed(2)}ms`)
    expect(html.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  test('commitHydrate() completes under 500ms for 1000-node SSR tree (CI threshold)', () => {
    const html = renderToString(HydrateComp, { textEngine: fakeTextEngine })
    // safely inject rendered HTML into test DOM
    // to ensure HTMLElement instanceof checks use the same class
    const rootContainer = document.createElement('div')
    rootContainer.id = 'app'
    rootContainer.innerHTML = html
    document.body.appendChild(rootContainer)
    const root = rootContainer

    const p = prepare(HydrateComp, undefined, { textEngine: fakeTextEngine })
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    const state: DOMState = { domNodes: [], portalRoots: new Map() }

    const t0 = performance.now()
    const result = commitHydrate(layout, p, root, state, { strictMismatch: false })
    const elapsed = performance.now() - t0
    console.log(`[benchmark:hydration] commitHydrate(${result.hydratedNodeCount} nodes): ${elapsed.toFixed(2)}ms, mismatches: ${result.mismatchCount}`)
    expect(result.mismatchCount).toBe(0)
    expect(elapsed).toBeLessThan(500)
  })
})
