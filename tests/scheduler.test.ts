import { describe, test, expect } from 'bun:test'
import { scheduleRender, cancelScheduled, resetScheduler, setScheduler } from '../src/scheduler.js'

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

describe('setScheduler', () => {
  test('setScheduler configures global scheduler used when no per-call scheduler is provided', () => {
    resetScheduler()
    let storedCb: (() => void) | null = null

    setScheduler((cb) => {
      storedCb = cb
    })

    let executed = false
    scheduleRender(() => { executed = true }) // no per-call scheduler

    expect(storedCb).not.toBeNull()
    storedCb!()
    expect(executed).toBe(true)

    resetScheduler() // cleanup: also resets global scheduler
  })

  test('per-call scheduler overrides global scheduler set via setScheduler', () => {
    resetScheduler()
    let globalCalled = false
    let perCallCb: (() => void) | null = null

    setScheduler(() => { globalCalled = true })

    scheduleRender(() => {}, (cb) => { perCallCb = cb })

    expect(globalCalled).toBe(false) // global NOT invoked
    expect(perCallCb).not.toBeNull()

    resetScheduler()
  })

  test('resetScheduler resets global scheduler so custom is no longer active', () => {
    resetScheduler()
    let customCalled = false
    setScheduler(() => { customCalled = true })

    resetScheduler() // reset — custom should no longer be the global

    // In Bun, requestAnimationFrame is undefined so defaultScheduler uses setTimeout.
    // We mock setTimeout to confirm the default scheduler (not custom) is invoked.
    let timeoutScheduled = false
    const origSetTimeout = globalThis.setTimeout
    ;(globalThis as any).setTimeout = (cb: () => void) => {
      timeoutScheduled = true
      return 0
    }

    scheduleRender(() => {}) // no per-call scheduler — must use resetted defaultScheduler

    globalThis.setTimeout = origSetTimeout

    expect(customCalled).toBe(false)
    expect(timeoutScheduled).toBe(true)

    resetScheduler()
  })
})
