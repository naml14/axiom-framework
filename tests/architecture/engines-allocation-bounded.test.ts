/**
 * Architectural enforcement: the hot path (`reflow → diff → commit`) must not
 * leak allocations. Layout engines (flex, grid) acquire scratch buffers from
 * the engines pool and release them in a `finally` block; this test confirms
 * the invariant via two angles:
 *
 * 1. **Pool size bound**: after many reflows, the pool does not grow without
 *    limit — it stays at or under MAX_POOLED_ENTRIES (32 by default).
 * 2. **Heap growth bound**: forcing GC before/after many reflows, the heap
 *    delta stays bounded — not linear in the number of reflows.
 *
 * If a future change introduces a leaked allocation (e.g. a scratch buffer
 * that is acquired but never released), the pool size grows past the bound
 * and/or the heap delta grows linearly with the number of reflows.
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { defineComponent } from '../../src/render/component.js'
import { prepare } from '../../src/render/prepare.js'
import { reflow } from '../../src/render/reflow.js'
import { clearEnginesScratchPools, getEnginesScratchPoolSizes } from '../../src/render/engines/scratch.js'

// Force GC to settle allocations before measuring. Bun.gc() is available in
// the Bun runtime; it returns void.
declare const Bun: { gc(force?: boolean): void } | undefined

function forceGc(): void {
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') {
    Bun.gc(true)
  }
}

// Build a moderately complex tree that exercises flex + grid layout engines.
function buildFlexTree(childCount: number) {
  return defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    layout: { flexDirection: 'column' as const, gap: 4, padding: 8 },
    children: Array.from({ length: childCount }, (_, i) => ({
      type: 'element' as const,
      tag: 'div',
      key: String(i),
      layout: { flexDirection: 'row' as const, gap: 2 },
      children: [
        { type: 'text' as const, content: `item-${i}-title` },
        { type: 'text' as const, content: `item-${i}-body` },
      ],
    })),
  }))
}

function buildGridTree(cols: number, rows: number) {
  return defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    layout: {
      display: 'grid' as const,
      gridTemplateColumns: cols,
      gap: 4,
    },
    children: Array.from({ length: cols * rows }, (_, i) => ({
      type: 'element' as const,
      tag: 'div',
      key: String(i),
      layout: { width: 50, height: 30 },
    })),
  }))
}

const CONSTRAINTS = { maxWidth: 800, maxHeight: 6000 }

beforeEach(() => {
  clearEnginesScratchPools()
})

describe('architectural invariant: hot-path allocations stay bounded', () => {
  test('flex pool size stays under MAX_POOLED_ENTRIES after 200 reflows', () => {
    const prepared = prepare(buildFlexTree(50), undefined)
    for (let i = 0; i < 200; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const sizes = getEnginesScratchPoolSizes()
    expect(sizes.flex).toBeLessThanOrEqual(32)
  })

  test('grid pool size stays under MAX_POOLED_ENTRIES after 200 reflows', () => {
    const prepared = prepare(buildGridTree(4, 25), undefined)
    for (let i = 0; i < 200; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const sizes = getEnginesScratchPoolSizes()
    expect(sizes.grid).toBeLessThanOrEqual(32)
  })

  test('flex pool stabilizes — same buffer reused across calls', () => {
    const prepared = prepare(buildFlexTree(50), undefined)

    // Warm up the pool.
    for (let i = 0; i < 10; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const warmSize = getEnginesScratchPoolSizes().flex

    // Run many more reflows — pool should NOT keep growing.
    for (let i = 0; i < 1000; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const finalSize = getEnginesScratchPoolSizes().flex

    expect(finalSize).toBe(warmSize)
  })

  test('grid pool stabilizes — same buffer reused across calls', () => {
    const prepared = prepare(buildGridTree(4, 25), undefined)

    for (let i = 0; i < 10; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const warmSize = getEnginesScratchPoolSizes().grid

    for (let i = 0; i < 1000; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    const finalSize = getEnginesScratchPoolSizes().grid

    expect(finalSize).toBe(warmSize)
  })

  test('heap delta is bounded across many reflows (does not grow linearly)', () => {
    // Skip if Bun.gc is unavailable — the test relies on forced GC for stability.
    if (typeof Bun === 'undefined' || typeof Bun.gc !== 'function') {
      console.warn('[allocation-bounded] Bun.gc unavailable — skipping heap delta assertion')
      return
    }

    const prepared = prepare(buildFlexTree(20), undefined)

    // Warm up: trigger any one-time allocations (JIT, V8 caches, pool warm).
    for (let i = 0; i < 50; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    forceGc()
    const baseline = process.memoryUsage().heapUsed

    // Run many reflows; if any allocation leaks per-call, heap grows linearly.
    const ITERATIONS = 5000
    for (let i = 0; i < ITERATIONS; i++) {
      reflow(prepared, CONSTRAINTS, { lineHeight: 20 })
    }
    forceGc()

    const after = process.memoryUsage().heapUsed
    const delta = after - baseline
    // Threshold: 4 KB per reflow × 5000 = 20 MB ceiling. In practice we expect
    // < 1 MB total — well under this generous bound that catches real leaks.
    const perCallCeilingBytes = 4 * 1024
    const ceiling = perCallCeilingBytes * ITERATIONS

    console.log(
      `[allocation-bounded] heap delta after ${ITERATIONS} reflows: ${(delta / 1024).toFixed(1)} KB (ceiling: ${(ceiling / 1024 / 1024).toFixed(1)} MB)`
    )

    expect(delta).toBeLessThan(ceiling)
  })

  test('mixed flex+grid reflows do not leak scratch buffers', () => {
    const flexPrepared = prepare(buildFlexTree(20), undefined)
    const gridPrepared = prepare(buildGridTree(3, 10), undefined)

    for (let i = 0; i < 200; i++) {
      reflow(flexPrepared, CONSTRAINTS, { lineHeight: 20 })
      reflow(gridPrepared, CONSTRAINTS, { lineHeight: 20 })
    }

    const sizes = getEnginesScratchPoolSizes()
    expect(sizes.flex).toBeLessThanOrEqual(32)
    expect(sizes.grid).toBeLessThanOrEqual(32)
  })
})