/**
 * Scratch buffer pool for layout engines.
 *
 * Grid and flex allocate several temporary structures per call (rowHeights,
 * placements, deferred queues, occupied-cells sets, flex lines, line items).
 * When the hot path runs on every animation frame, these allocations
 * translate into GC pressure that fights the "zero-overhead hot path" promise
 * documented in ARCHITECTURE.md.
 *
 * This pool keeps a bounded set of scratch buffers and recycles them across
 * calls. The lifecycle is local to each engine call — `acquire` at the
 * start, `release` in a `finally` block. Recursive calls (e.g. grid inside
 * grid) each acquire and release their own scratch independently; the pool
 * handles the recycling across them.
 *
 * The pattern mirrors `src/render/pool.ts` (LayoutResult recycling) on
 * purpose — same eviction policy, same age-based pruning.
 *
 * **Iteration design**: rather than `push({...})` a fresh object per child,
 * flex and grid take pre-allocated objects from a sub-pool (`itemPool`,
 * `placementPool`) and overwrite their fields in place. Field shapes are
 * flat (no nested sub-objects) so that mutation is enough — no allocations
 * leak through.
 */

import type { PreparedComponent, LayoutProps } from '../../core/types.js'

// ============================================================
// Buffer shapes (kept here so flex.ts / grid.ts can import without circular deps)
// ============================================================

/**
 * A flex line item. Fields are flat (`sizeWidth`/`sizeHeight`) so we can
 * overwrite in place without allocating a `{width, height}` sub-object per
 * child.
 */
export interface FlexLineItemScratch {
  child: PreparedComponent
  sizeWidth: number
  sizeHeight: number
  childIdx: number
}

/**
 * A completed (or in-progress) flex line. `items` is a list of references
 * into `FlexScratch.itemPool` — never freshly allocated objects.
 */
export interface FlexLineScratch {
  items: FlexLineItemScratch[]
  itemCount: number
  mainSize: number
  crossSize: number
}

export interface FlexScratch {
  /** Completed lines (post-wrap). Each is a reference to a linePool entry. */
  lines: FlexLineScratch[]
  /**
   * Pre-allocated line objects. The "current working line" is
   * `linePool[currentLineIdx]`. When wrap fires, we push the current line
   * and advance the index — each line keeps its own data because they are
   * distinct objects (not the same reference reset in place, which would
   * erase previously-pushed lines).
   */
  linePool: FlexLineScratch[]
  currentLineIdx: number
  /** Pool of items (growable; recycled across calls). */
  itemPool: FlexLineItemScratch[]
  /** How many items have been taken from the pool during this call. */
  nextItemIdx: number
}

/** Take the next item from the pool, growing it lazily. */
export function takeFlexItem(scratch: FlexScratch): FlexLineItemScratch {
  if (scratch.nextItemIdx >= scratch.itemPool.length) {
    scratch.itemPool.push({
      child: null!,
      sizeWidth: 0,
      sizeHeight: 0,
      childIdx: 0,
    })
  }
  return scratch.itemPool[scratch.nextItemIdx++]!
}

/**
 * A grid placement. Flat fields to avoid per-placement sub-object allocations.
 */
export interface GridPlacementScratch {
  child: PreparedComponent
  childIdx: number
  row: number
  col: number
  rowSpan: number
  colSpan: number
  childHeight: number
}

export interface DeferredGridPlacementScratch {
  child: PreparedComponent
  childIdx: number
  childHeight: number
  rowSpan: number
  colSpan: number
  fixedRow?: number
  fixedCol?: number
}

export interface LocalizedSecondPassRemeasureScratch {
  child: PreparedComponent
  childWidth: number
  childLayout: LayoutProps | undefined
}

export interface GridScratch {
  rowHeights: number[]
  /** Cumulative Y offsets per row, computed by buildRowOffsets. Reused across calls. */
  rowOffsets: number[]
  /** Completed placements (refs into placementPool). */
  placements: GridPlacementScratch[]
  /** Deferred placements (refs into deferredPool). */
  deferredQueue: DeferredGridPlacementScratch[]
  secondPassVerticalPercentByChildIdx: Map<number, number>
  localizedSecondPassRemeasureByChildIdx: Map<number, LocalizedSecondPassRemeasureScratch>
  occupiedCells: Set<number>
  /** Pool of placement objects (growable; recycled across calls). */
  placementPool: GridPlacementScratch[]
  nextPlacementIdx: number
  /** Pool of deferred placement objects (growable). */
  deferredPool: DeferredGridPlacementScratch[]
  nextDeferredIdx: number
}

/** Take the next grid placement from the pool, growing it lazily. */
export function takeGridPlacement(scratch: GridScratch): GridPlacementScratch {
  if (scratch.nextPlacementIdx >= scratch.placementPool.length) {
    scratch.placementPool.push({
      child: null!,
      childIdx: 0,
      row: 0,
      col: 0,
      rowSpan: 0,
      colSpan: 0,
      childHeight: 0,
    })
  }
  return scratch.placementPool[scratch.nextPlacementIdx++]!
}

/** Take the next deferred placement from the pool, growing it lazily. */
export function takeDeferredPlacement(scratch: GridScratch): DeferredGridPlacementScratch {
  if (scratch.nextDeferredIdx >= scratch.deferredPool.length) {
    scratch.deferredPool.push({
      child: null!,
      childIdx: 0,
      childHeight: 0,
      rowSpan: 0,
      colSpan: 0,
    })
  }
  return scratch.deferredPool[scratch.nextDeferredIdx++]!
}

// ============================================================
// Generic pool machinery (re-used by both flex and grid scratch)
// ============================================================

const MAX_POOLED_AGE_MS = 30_000
const MAX_POOLED_ENTRIES = 32

interface PoolEntry<T> {
  buffers: T
  releasedAt: number
}

function createScratchPool<T>(
  factory: () => T,
  reset: (buffers: T) => void
): {
  acquire: () => T
  release: (buffers: T) => void
  size: () => number
  clear: () => void
} {
  const pool: PoolEntry<T>[] = []
  // Use Set (strong ref) instead of WeakSet — scratch buffers contain
  // Maps/Sets/Arrays which are not WeakKey-compatible. The pool is bounded
  // (MAX_POOLED_ENTRIES) so strong refs are safe.
  const inPool = new Set<T>()

  function pruneExpiredEntries(now: number): void {
    for (let i = pool.length - 1; i >= 0; i--) {
      const entry = pool[i]!
      if (now - entry.releasedAt > MAX_POOLED_AGE_MS) {
        inPool.delete(entry.buffers)
        pool.splice(i, 1)
      }
    }
  }

  return {
    acquire(): T {
      // Hot path: linear search for a pooled buffer only — no Date.now(),
      // no prune. Pruning is release-time only (every release prunes
      // expired entries from any prior release).
      for (let i = pool.length - 1; i >= 0; i--) {
        const candidate = pool[i]!
        pool.splice(i, 1)
        inPool.delete(candidate.buffers)
        return candidate.buffers
      }
      return factory()
    },
    release(buffers: T): void {
      if (inPool.has(buffers)) {
        if (isDevEnvironment()) {
          throw new Error('Scratch buffers already released to pool')
        }
        return
      }
      const now = Date.now()
      pruneExpiredEntries(now)
      if (pool.length >= MAX_POOLED_ENTRIES) {
        const evicted = pool.shift()
        if (evicted !== undefined) inPool.delete(evicted.buffers)
      }
      reset(buffers)
      pool.push({ buffers, releasedAt: now })
      inPool.add(buffers)
    },
    size(): number {
      pruneExpiredEntries(Date.now())
      return pool.length
    },
    clear(): void {
      // Clear both the entry list and the strong-ref set so cleared buffers
      // can actually be garbage-collected. Without `inPool.clear()`, every
      // scratch buffer ever produced would stay alive forever even after
      // `clearEnginesScratchPools()` is called.
      pool.length = 0
      inPool.clear()
    },
  }
}

function isDevEnvironment(): boolean {
  if (globalThis.__AXIOM_DEV__ === true) return true
  if (globalThis.__AXIOM_DEV__ === false) return false
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return nodeEnv !== 'production'
}

// ============================================================
// Flex scratch pool
// ============================================================

const FLEX_INITIAL_LINE_CAPACITY = 4

function emptyFlexLine(): FlexLineScratch {
  return { items: [], itemCount: 0, mainSize: 0, crossSize: 0 }
}

const flexPool = createScratchPool<FlexScratch>(
  () => ({
    lines: [],
    linePool: Array.from({ length: FLEX_INITIAL_LINE_CAPACITY }, emptyFlexLine),
    currentLineIdx: 0,
    itemPool: [],
    nextItemIdx: 0,
  }),
  (s) => {
    s.lines.length = 0
    // Reset all lines in the pool (in case the pool grew during the call).
    // PRESERVE itemPool — entries are overwritten in place by takeFlexItem.
    // Truncating here would force allocations proportional to child count
    // on every reflow and break the zero-allocation hot path promise.
    for (const line of s.linePool) {
      line.items.length = 0
      line.itemCount = 0
      line.mainSize = 0
      line.crossSize = 0
    }
    s.currentLineIdx = 0
    s.nextItemIdx = 0
  }
)

export function acquireFlexScratch(): FlexScratch {
  return flexPool.acquire()
}

export function releaseFlexScratch(s: FlexScratch): void {
  flexPool.release(s)
}

// ============================================================
// Grid scratch pool
// ============================================================

const gridPool = createScratchPool<GridScratch>(
  () => ({
    rowHeights: [],
    rowOffsets: [],
    placements: [],
    deferredQueue: [],
    secondPassVerticalPercentByChildIdx: new Map(),
    localizedSecondPassRemeasureByChildIdx: new Map(),
    occupiedCells: new Set(),
    placementPool: [],
    nextPlacementIdx: 0,
    deferredPool: [],
    nextDeferredIdx: 0,
  }),
  (s) => {
    // Reset only cursors and the consumer-facing arrays. PRESERVE
    // placementPool and deferredPool — entries are overwritten in place by
    // takeGridPlacement / takeDeferredPlacement. Truncating them here would
    // force allocations proportional to child count on every reflow and
    // break the zero-allocation hot path promise.
    s.rowHeights.length = 0
    s.rowOffsets.length = 0
    s.placements.length = 0
    s.deferredQueue.length = 0
    s.secondPassVerticalPercentByChildIdx.clear()
    s.localizedSecondPassRemeasureByChildIdx.clear()
    s.occupiedCells.clear()
    s.nextPlacementIdx = 0
    s.nextDeferredIdx = 0
  }
)

export function acquireGridScratch(): GridScratch {
  return gridPool.acquire()
}

export function releaseGridScratch(s: GridScratch): void {
  gridPool.release(s)
}

// ============================================================
// Diagnostics (testing only)
// ============================================================

export function getEnginesScratchPoolSizes(): { flex: number, grid: number } {
  return { flex: flexPool.size(), grid: gridPool.size() }
}

export function clearEnginesScratchPools(): void {
  flexPool.clear()
  gridPool.clear()
}