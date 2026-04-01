// ============================================================
// Scheduler — batches render calls via requestAnimationFrame
// Injectable for testability
// ============================================================

export type SchedulerFn = (cb: RenderCallback) => void

type RenderCallback = () => void
type SchedulerFn = (cb: RenderCallback) => void

let pendingRender: RenderCallback | null = null
let generation = 0

export function scheduleRender(callback: RenderCallback, scheduler?: SchedulerFn): void {
  pendingRender = callback // last write wins

  const gen = ++generation
  const sched = scheduler ?? defaultScheduler

  sched(() => {
    if (generation !== gen) return // stale callback
    const cb = pendingRender
    pendingRender = null
    cb?.()
  })
}

export function cancelScheduled(): void {
  generation++ // invalidate any pending callbacks
  pendingRender = null
}

export function resetScheduler(): void {
  generation = 0
  pendingRender = null
}

export function setScheduler(scheduler: SchedulerFn): void {
  // For future use — currently scheduler is passed per-call
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
