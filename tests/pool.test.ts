import { test, expect, describe, beforeEach } from 'bun:test'
import { acquireLayoutResult, releaseLayoutResult, clearLayoutPool } from '../src/render/pool.js'

describe('LayoutResult Memory Pool', () => {
  beforeEach(() => {
    clearLayoutPool()
  })

  test('acquireLayoutResult allocates new buffer when empty', () => {
    const result = acquireLayoutResult(10)
    expect(result.nodeCount).toBe(10)
    expect(result.x.length).toBe(10)
    expect(result.y.length).toBe(10)
    expect(result.width.length).toBe(10)
    expect(result.height.length).toBe(10)
  })

  test('release and acquire reuses the exact same buffer', () => {
    const result1 = acquireLayoutResult(10)
    result1.width[0] = 500

    releaseLayoutResult(result1)

    const result2 = acquireLayoutResult(10)
    expect(result2).toBe(result1) // Identity check!
  })

  test('acquireLayoutResult zeroes out reused buffer indices up to nodeCount', () => {
    const result1 = acquireLayoutResult(10)
    result1.x[0] = 100
    result1.y[2] = 200
    result1.width[5] = 500
    result1.height[9] = 900

    releaseLayoutResult(result1)

    // Acquire with smaller requested capacity
    const result2 = acquireLayoutResult(5)
    expect(result2).toBe(result1)
    expect(result2.nodeCount).toBe(5)

    // The first 5 indices must be zeroed out
    expect(result2.x[0]).toBe(0)
    expect(result2.y[2]).toBe(0)

    // Indices beyond the new minCapacity might retain old values,
    // which is safe because iteration is bounded by nodeCount
    expect(result2.width[5]).toBe(500)
    expect(result2.height[9]).toBe(900)
  })

  test('acquireLayoutResult discards too-small buffers and allocates larger ones', () => {
    const result1 = acquireLayoutResult(10)
    releaseLayoutResult(result1)

    const result2 = acquireLayoutResult(20)
    expect(result2).not.toBe(result1)
    expect(result2.nodeCount).toBe(20)
    expect(result2.x.length).toBe(20)
  })

  test('acquireLayoutResult can reuse a suitable buffer deeper in pool', () => {
    const small = acquireLayoutResult(4)
    const large = acquireLayoutResult(12)

    releaseLayoutResult(large)
    releaseLayoutResult(small)

    const reused = acquireLayoutResult(10)
    expect(reused).toBe(large)
    expect(reused.x.length).toBe(12)
  })

  test('releaseLayoutResult rejects double release in dev/test env', () => {
    const result = acquireLayoutResult(8)
    releaseLayoutResult(result)
    expect(() => releaseLayoutResult(result)).toThrow('LayoutResult already released to pool')
  })

  test('releaseLayoutResult does not keep oversized buffers', () => {
    const huge = acquireLayoutResult(20000)
    releaseLayoutResult(huge)

    const acquired = acquireLayoutResult(20000)
    expect(acquired).not.toBe(huge)
  })

  test('clearLayoutPool empties the pool', () => {
    const result1 = acquireLayoutResult(10)
    releaseLayoutResult(result1)

    clearLayoutPool()

    const result2 = acquireLayoutResult(10)
    expect(result2).not.toBe(result1)
  })
})
