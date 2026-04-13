import { describe, test, expect } from 'bun:test'
import { scheduleRender, cancelScheduled, resetScheduler } from '../src/scheduler.js'

describe('scheduler', () => {
  test('executes callback via injectable scheduler', () => {
    resetScheduler()
    let executed = false
    let storedCb: (() => void) | null = null

    const mockScheduler = (cb: () => void) => {
      storedCb = cb
    }

    scheduleRender(() => {
      executed = true
    }, mockScheduler)

    expect(storedCb).not.toBeNull()
    storedCb!()
    expect(executed).toBe(true)
  })

  test('batches multiple calls into one execution', () => {
    resetScheduler()
    let callCount = 0
    let storedCb: (() => void) | null = null

    const mockScheduler = (cb: () => void) => {
      storedCb = cb
    }

    scheduleRender(() => { callCount++ }, mockScheduler)
    scheduleRender(() => { callCount++ }, mockScheduler)
    scheduleRender(() => { callCount++ }, mockScheduler)

    // Scheduler is invoked only once (batching), but all 3 callbacks run in that single flush
    expect(storedCb).not.toBeNull()
    storedCb!()
    expect(callCount).toBe(3)
  })

  test('cancelScheduled clears pending render', () => {
    resetScheduler()
    let executed = false
    let storedCb: (() => void) | null = null

    const mockScheduler = (cb: () => void) => {
      storedCb = cb
    }

    scheduleRender(() => {
      executed = true
    }, mockScheduler)
    cancelScheduled()

    expect(storedCb).not.toBeNull()
    storedCb!()
    expect(executed).toBe(false) // cancelled
  })

  test('last write wins for batched callbacks', () => {
    resetScheduler()
    let value = 0
    let storedCb: (() => void) | null = null

    const mockScheduler = (cb: () => void) => {
      storedCb = cb
    }

    scheduleRender(() => { value = 1 }, mockScheduler)
    scheduleRender(() => { value = 2 }, mockScheduler)
    scheduleRender(() => { value = 3 }, mockScheduler)

    expect(storedCb).not.toBeNull()
    storedCb!()
    expect(value).toBe(3)
  })
})
