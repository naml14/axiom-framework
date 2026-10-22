import { describe, test, expect } from 'bun:test'
import { scheduleRender, cancelScheduled, resetScheduler, setScheduler, type SchedulerFn } from '../src/scheduler.js'

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

  test('multiple schedulers remain isolated from each other (A3)', () => {
    resetScheduler()
    let flushed1 = false
    let flushed2 = false
    let trigger1: (() => void) | null = null
    let trigger2: (() => void) | null = null

    const scheduler1: SchedulerFn = (cb) => { trigger1 = cb }
    const scheduler2: SchedulerFn = (cb) => { trigger2 = cb }

    scheduleRender(() => { flushed1 = true }, scheduler1)
    scheduleRender(() => { flushed2 = true }, scheduler2)

    expect(trigger1).not.toBeNull()
    expect(trigger2).not.toBeNull()

    // Flushing scheduler 1 only executes its own callback
    trigger1!()
    expect(flushed1).toBe(true)
    expect(flushed2).toBe(false)

    // Flushing scheduler 2 executes its own callback
    trigger2!()
    expect(flushed2).toBe(true)
  })

  test('cancelScheduled with specific scheduler only cancels that scheduler queue', () => {
    resetScheduler()
    let executed1 = false
    let executed2 = false
    let trigger1: (() => void) | null = null
    let trigger2: (() => void) | null = null

    const scheduler1: SchedulerFn = (cb) => { trigger1 = cb }
    const scheduler2: SchedulerFn = (cb) => { trigger2 = cb }

    scheduleRender(() => { executed1 = true }, scheduler1)
    scheduleRender(() => { executed2 = true }, scheduler2)

    cancelScheduled(scheduler1)

    trigger1!()
    trigger2!()

    expect(executed1).toBe(false)
    expect(executed2).toBe(true)
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

    // Other test files may define requestAnimationFrame globally.
    // Force the fallback branch explicitly so this assertion stays deterministic
    // in the full suite and under coverage instrumentation.
    let timeoutScheduled = false
    const origSetTimeout = globalThis.setTimeout
    const origRequestAnimationFrame = globalThis.requestAnimationFrame
    delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame
    ;(globalThis as any).setTimeout = (_cb: () => void) => {
      timeoutScheduled = true
      return 0
    }

    try {
      scheduleRender(() => {}) // no per-call scheduler — must use reset defaultScheduler
    } finally {
      globalThis.setTimeout = origSetTimeout
      if (origRequestAnimationFrame === undefined) {
        delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame
      } else {
        globalThis.requestAnimationFrame = origRequestAnimationFrame
      }
    }

    expect(customCalled).toBe(false)
    expect(timeoutScheduled).toBe(true)

    resetScheduler()
  })
})
