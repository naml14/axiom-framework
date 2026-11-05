// ============================================================
// Scheduler — batches render calls via requestAnimationFrame
// Injectable for testability
// ============================================================

type RenderCallback = () => void
export type SchedulerFn = (cb: RenderCallback) => void

interface SchedulerQueue {
  callbacks: Set<RenderCallback>
  scheduled: boolean
}

const queues = new Map<SchedulerFn, SchedulerQueue>()
let _globalScheduler: SchedulerFn = defaultScheduler

function getQueue(scheduler: SchedulerFn): SchedulerQueue {
  let queue = queues.get(scheduler)
  if (!queue) {
    queue = { callbacks: new Set(), scheduled: false }
    queues.set(scheduler, queue)
  }
  return queue
}

// Creates a queue key that owns its pending callbacks while still driving the
// given scheduler. Two apps never share a queue, so unmounting one cannot drop
// the other's pending render, and a queue left behind by a dropped frame cannot
// strand a later app.
export function createIsolatedScheduler(scheduler?: SchedulerFn): SchedulerFn {
  const drive = scheduler ?? _globalScheduler
  return (cb: RenderCallback) => { drive(cb) }
}

export function scheduleRender(callback: RenderCallback, scheduler?: SchedulerFn): void {
  const sched = scheduler ?? _globalScheduler
  const queue = getQueue(sched)
  queue.callbacks.add(callback)

  if (!queue.scheduled) {
    queue.scheduled = true

    sched(() => {
      queue.scheduled = false
      const cbs = Array.from(queue.callbacks)
      queue.callbacks.clear()
      for (const cb of cbs) {
        cb()
      }
    })
  }
}

export function cancelScheduled(scheduler?: SchedulerFn): void {
  if (scheduler !== undefined) {
    const queue = queues.get(scheduler)
    if (queue) {
      queue.callbacks.clear()
      queue.scheduled = false
      queues.delete(scheduler)
    }
  } else {
    for (const queue of queues.values()) {
      queue.callbacks.clear()
      queue.scheduled = false
    }
    queues.clear()
  }
}

export function resetScheduler(): void {
  cancelScheduled()
  _globalScheduler = defaultScheduler
}

export function setScheduler(scheduler: SchedulerFn): void {
  _globalScheduler = scheduler
}

// Default scheduler uses requestAnimationFrame
function defaultScheduler(cb: RenderCallback): void {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(cb)
  } else {
    // Fallback for environments without rAF (e.g., Bun)
    setTimeout(cb, 0)
  }
}
