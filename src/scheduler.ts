// ============================================================
// Scheduler — batches render calls via requestAnimationFrame
// Injectable for testability
// ============================================================

type RenderCallback = () => void
export type SchedulerFn = (cb: RenderCallback) => void

const pendingRenders = new Set<RenderCallback>()
let scheduled = false
let _globalScheduler: SchedulerFn = defaultScheduler

export function scheduleRender(callback: RenderCallback, scheduler?: SchedulerFn): void {
  pendingRenders.add(callback)

  if (!scheduled) {
    scheduled = true
    const sched = scheduler ?? _globalScheduler

    sched(() => {
      scheduled = false
      const cbs = Array.from(pendingRenders)
      pendingRenders.clear()
      for (const cb of cbs) {
        cb()
      }
    })
  }
}

export function cancelScheduled(): void {
  pendingRenders.clear()
  scheduled = false
}

export function resetScheduler(): void {
  pendingRenders.clear()
  scheduled = false
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
