import type { ComponentDefinition, LayoutConstraints, LayoutResult, PreparedComponent } from './types.js'
import type { PretextModule, PrepareOptions } from './prepare.js'
import type { SchedulerFn } from './scheduler.js'
import type { ReflowOptions } from './reflow.js'

import { prepare, resetIndexCounter } from './prepare.js'
import { reflow, createLayoutResult } from './reflow.js'
import { fullDiff, type DOMOperation } from './diff.js'
import { commitFull, applyOps, type DOMState } from './commit.js'
import { effect } from './signals.js'
import { scheduleRender, cancelScheduled } from './scheduler.js'

// ============================================================
// Public API
// ============================================================

export interface RenderMetrics {
  prepareMs: number
  reflowMs: number
  commitMs: number
}

export interface AppOptions {
  lineHeight?: number
  font?: string
  pretext?: PretextModule
  scheduler?: SchedulerFn
}

export interface App {
  mount(): void
  unmount(): void
  getMetrics(): RenderMetrics
}

interface AppState {
  prevPrepared: PreparedComponent | null
  prevLayout: LayoutResult | null
  domState: DOMState
  mounted: boolean
  stopEffect: (() => void) | null
  metrics: RenderMetrics
}

export function createApp(
  component: ComponentDefinition<void>,
  root: HTMLElement,
  options?: AppOptions
): App {
  const state: AppState = {
    prevPrepared: null,
    prevLayout: null,
    domState: { domNodes: [] },
    mounted: false,
    stopEffect: null,
    metrics: { prepareMs: 0, reflowMs: 0, commitMs: 0 },
  }

  const prepareOpts: PrepareOptions = {
    font: options?.font ?? '16px sans-serif',
    pretext: options?.pretext,
  }

  const reflowOpts: ReflowOptions = {
    lineHeight: options?.lineHeight ?? 20,
  }

  const scheduler = options?.scheduler

  function getConstraints(): LayoutConstraints {
    return {
      maxWidth: root.clientWidth || 800,
      maxHeight: root.clientHeight || 600,
    }
  }

  function performUpdate(): void {
    const t0 = performance.now()
    const prepared = prepare(component, undefined, prepareOpts)
    state.metrics.prepareMs = performance.now() - t0

    const t1 = performance.now()
    const layout = reflow(prepared, getConstraints(), reflowOpts)
    state.metrics.reflowMs = performance.now() - t1

    const t2 = performance.now()
    if (state.prevPrepared === null) {
      // First update after mount — full commit
      commitFull(layout, prepared, root, state.domState)
    } else {
      // Subsequent update — diff and apply ops
      const ops = fullDiff(state.prevPrepared, state.prevLayout, prepared, layout, state.domState.domNodes)
      applyOps(ops, root, state.domState.domNodes)
    }
    state.metrics.commitMs = performance.now() - t2

    state.prevPrepared = prepared
    state.prevLayout = layout
  }

  return {
    mount(): void {
      if (state.mounted) return

      // First render — synchronous, no rAF
      const t0 = performance.now()
      const prepared = prepare(component, undefined, prepareOpts)
      state.metrics.prepareMs = performance.now() - t0

      const t1 = performance.now()
      const layout = reflow(prepared, getConstraints(), reflowOpts)
      state.metrics.reflowMs = performance.now() - t1

      const t2 = performance.now()
      commitFull(layout, prepared, root, state.domState)
      state.metrics.commitMs = performance.now() - t2

      state.prevPrepared = prepared
      state.prevLayout = layout
      state.mounted = true

      // Wire reactivity — subsequent updates go through scheduler
      // The effect reads signals by calling component._fn() to establish dependencies
      // Then schedules the actual render
      state.stopEffect = effect(() => {
        if (!state.mounted) return
        // Read signals to establish dependencies
        component._fn(undefined as void)
        // Schedule the actual render
        scheduleRender(() => performUpdate(), scheduler)
      })
    },

    unmount(): void {
      state.stopEffect?.()
      cancelScheduled()
      root.innerHTML = ''
      state.mounted = false
      state.prevPrepared = null
      state.prevLayout = null
      state.domState.domNodes.fill(null)
    },

    getMetrics(): RenderMetrics {
      return { ...state.metrics }
    },
  }
}
