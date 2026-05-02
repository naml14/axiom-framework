import type { LayoutResult } from '../core/types.js'

// ============================================================
// LayoutResult Memory Pool
// ============================================================
// Recycles Float32Arrays to avoid GC pressure during hot path reflows.
// Buffers only grow, they never shrink.

const pool: LayoutResult[] = []
let inPool = new WeakSet<LayoutResult>()

const MAX_POOLED_LAYOUTS = 32
const MAX_POOLED_CAPACITY = 16_384

function isDevEnvironment(): boolean {
  if (globalThis.__AXIOM_DEV__ === true) return true
  if (globalThis.__AXIOM_DEV__ === false) return false

  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return nodeEnv !== 'production'
}

function acquireFromPool(minCapacity: number): LayoutResult | undefined {
  for (let i = pool.length - 1; i >= 0; i--) {
    const candidate = pool[i]!
    if (candidate.x.length >= minCapacity) {
      pool.splice(i, 1)
      inPool.delete(candidate)
      return candidate
    }
  }

  return undefined
}

export function acquireLayoutResult(minCapacity: number): LayoutResult {
  let result = acquireFromPool(minCapacity)

  if (result === undefined) {
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
  if (inPool.has(result)) {
    if (isDevEnvironment()) {
      throw new Error('LayoutResult already released to pool')
    }
    return
  }

  if (result.x.length > MAX_POOLED_CAPACITY) {
    return
  }

  if (pool.length >= MAX_POOLED_LAYOUTS) {
    pool.shift()
  }

  pool.push(result)
  inPool.add(result)
}

export function clearLayoutPool(): void {
  pool.length = 0
  inPool = new WeakSet<LayoutResult>()
}

/**
 * Returns the current number of cached buffers in the pool.
 * Useful for metrics and debugging.
 */
export function getLayoutPoolSize(): number {
  return pool.length
}
