import type { ComponentDefinition, LayoutConstraints, LayoutResult, PreparedComponent } from './types.js'
import type { PretextModule, PrepareOptions } from './prepare.js'
import type { SchedulerFn } from './scheduler.js'
import type { ReflowOptions } from './reflow.js'

import { prepare, resetIndexCounter } from './prepare.js'
import { reflow, createLayoutResult } from './reflow.js'
import { fullDiff, type DOMOperation } from './diff.js'
import { commitFull, applyOps, fireUnmountEvents, type DOMState } from './commit.js'
import { effect } from './signals.js'
import { scheduleRender, cancelScheduled } from './scheduler.js'
import { getNodeType, getTag, getChildren } from './prepare.js'

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
    domState: { domNodes: [], portalRoots: new Map() },
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

  /**
   * Read the current container dimensions from the DOM.
   *
   * This is the ONLY intentional DOM read in the framework.
   * It runs once per update cycle (not per frame, not in the hot path)
   * to establish the layout constraints before prepare/reflow begin.
   *
   * This read does NOT violate the zero-DOM-reads invariant because:
   * 1. It happens BEFORE reflow() — it provides input, not feedback
   * 2. It is a single read, not interleaved with writes
   * 3. The result is passed as a plain value into the pure arithmetic pipeline
   */
  function getConstraints(): LayoutConstraints {
    return {
      maxWidth: root.clientWidth || 800,
      maxHeight: root.clientHeight || 600,
    }
  }

  function isSameTopology(a: PreparedComponent, b: PreparedComponent): boolean {
    if (getNodeType(a) !== getNodeType(b)) return false
    if (getTag(a) !== getTag(b)) return false
    
    const aChildren = getChildren(a)
    const bChildren = getChildren(b)
    if (aChildren.length !== bChildren.length) return false
    
    for (let i = 0; i < aChildren.length; i++) {
      if (!isSameTopology(aChildren[i]!, bChildren[i]!)) return false
    }
    
    return true
  }

  function performUpdate(): void {
    const t0 = performance.now()
    const prepared = prepare(component, undefined, prepareOpts)
    state.metrics.prepareMs = performance.now() - t0

    const t1 = performance.now()
    const layout = reflow(prepared, getConstraints(), reflowOpts)
    state.metrics.reflowMs = performance.now() - t1

    const t2 = performance.now()
    const shapeChanged = state.prevPrepared === null
      || !isSameTopology(state.prevPrepared, prepared)

    if (shapeChanged) {
      // Shape change (e.g. column count changed) — full teardown and re-commit.
      // applyOps can't handle hierarchy changes because it flat-appends inserts to root.
      fireUnmountEvents(state.domState.domNodes)
      // Clear portal targets BEFORE resetting root — they are outside root.innerHTML scope
      for (const portalTarget of state.domState.portalRoots.values()) {
        portalTarget.innerHTML = ''
      }
      root.innerHTML = ''
      state.domState.domNodes = []
      state.domState.portalRoots = new Map()
      commitFull(layout, prepared, root, state.domState)
    } else {
      // Value change only — incremental diff and apply
      const ops = fullDiff(state.prevPrepared, state.prevLayout, prepared, layout, state.domState.domNodes)
      applyOps(ops, root, state.domState.domNodes)
      // Update root height (commitFull does this internally, but applyOps doesn't)
      const rootHeight = layout.height[0]
      if (rootHeight > 0) {
        root.style.height = `${rootHeight}px`
      }
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
      fireUnmountEvents(state.domState.domNodes)
      // Clear portal targets BEFORE wiping root — they live outside root DOM scope
      for (const portalTarget of state.domState.portalRoots.values()) {
        portalTarget.innerHTML = ''
      }
      root.innerHTML = ''
      state.mounted = false
      state.prevPrepared = null
      state.prevLayout = null
      // Replace the array reference (not just fill) to release all DOM node references
      // and allow the GC to collect them, preventing memory leaks in long-lived apps.
      state.domState.domNodes = []
      state.domState.portalRoots = new Map()
    },

    getMetrics(): RenderMetrics {
      return { ...state.metrics }
    },
  }
}
