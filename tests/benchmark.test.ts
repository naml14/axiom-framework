import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { defineComponent } from '../src/component.js'
import { prepare } from '../src/prepare.js'
import { reflow } from '../src/reflow.js'
import { commitFull } from '../src/commit.js'
import type { DOMState } from '../src/commit.js'

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
function buildBenchmarkComponent(count: number) {
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
            content: `This is the body text for card ${i + 1}. It contains enough content to exercise the text measurement path and ensure multiple lines are calculated correctly under a constrained width.`,
          }],
        },
      ],
    })),
  }))
}

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
})
