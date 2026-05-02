import type { LayoutResult } from '../core/types.js'

// ============================================================
// LayoutResult Memory Pool
// ============================================================
// Recycles Float32Arrays to avoid GC pressure during hot path reflows.
// Buffers only grow, they never shrink.

const pool: LayoutResult[] = []

export function acquireLayoutResult(minCapacity: number): LayoutResult {
  let result = pool.pop()

  if (result === undefined || result.x.length < minCapacity) {
    // If we have a result but it's too small, we discard it and let the GC collect it.
    // Over time, the pool will stabilize at the high-water mark capacity.
    result = {
      x: new Float32Array(minCapacity),
      y: new Float32Array(minCapacity),
      width: new Float32Array(minCapacity),
      height: new Float32Array(minCapacity),
      nodeCount: minCapacity,
    }
  } else {
    result.nodeCount = minCapacity
    // We must clear the active area of the buffer to prevent stale layout
    // dimensions from interfering with arithmetic logic (e.g. `result.height[idx] === 0` checks)
    result.x.fill(0, 0, minCapacity)
    result.y.fill(0, 0, minCapacity)
    result.width.fill(0, 0, minCapacity)
    result.height.fill(0, 0, minCapacity)
  }

  return result
}

export function releaseLayoutResult(result: LayoutResult): void {
  pool.push(result)
}

export function clearLayoutPool(): void {
  pool.length = 0
}

/**
 * Returns the current number of cached buffers in the pool.
 * Useful for metrics and debugging.
 */
export function getLayoutPoolSize(): number {
  return pool.length
}
