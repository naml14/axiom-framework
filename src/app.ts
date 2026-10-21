import type {
  AxiomDevHook,
  ComponentDefinition,
  LayoutConstraints,
  LayoutResult,
  PreparedComponent,
  ProfileEvent,
  ProfilePhase,
  ProfileSubscriber,
  CommitOptions,
} from './core/types.js'
import type { TextLayoutEngine, PrepareOptions } from './render/prepare.js'
import type { SchedulerFn } from './scheduler.js'
import type { ReflowOptions } from './render/reflow.js'
import type { Router } from './router.js'

import { prepare } from './render/prepare.js'
import { reflow } from './render/reflow.js'
import { fullDiff, type DOMOperation } from './render/diff.js'
import { commitFull, commitHydrate, applyOps, fireUnmountEvents, type DOMState } from './render/commit.js'
import { effect } from './reactivity/signals.js'
import { scheduleRender, cancelScheduled } from './scheduler.js'
import { getNodeType, getTag, getChildren, getDebugDisplayName, getDebugRoute } from './render/prepare.js'
import { resolveComponentDisplayName } from './render/component.js'
import { applyPluginHook } from './features/plugin.js'
import type { PluginContext } from './features/plugin.js'
import { releaseLayoutResult } from './render/pool.js'

// ============================================================
// Internal helpers
// ============================================================

/** Module-scoped counter for deterministic, collision-free app IDs within a JS context. */
let _appCounter = 0
function generateAppId(): string {
  return `axiom-app-${++_appCounter}`
}

/** Remove only the DOM nodes Axiom inserted into each portal target — never nuke foreign content. */
function clearPortalRoots(domState: DOMState): void {
  for (const entry of domState.portalRoots.values()) {
    for (const node of entry.nodes) {
      if (node.parentNode === entry.target) {
        entry.target.removeChild(node)
      }
    }
  }
}

const AXIOM_DEV_HOOK_VERSION = '0.2.7'

function isDevEnvironment(): boolean {
  if (globalThis.__AXIOM_DEV__ === true) return true
  if (globalThis.__AXIOM_DEV__ === false) return false

  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return nodeEnv === 'development'
}

function installDevHook(state: AppState): void {
  if (!isDevEnvironment() || typeof window === 'undefined') return

  const metrics = Object.freeze({
    get prepareMs(): number {
      return state.metrics.prepareMs
    },
    get reflowMs(): number {
      return state.metrics.reflowMs
    },
    get commitMs(): number {
      return state.metrics.commitMs
    },
  })

  const profiling = Object.freeze({
    get enabled(): boolean {
      return state.profileSubscribers.size > 0
    },
    get cycle(): number {
      return state.profileCycle
    },
    get subscriberCount(): number {
      return state.profileSubscribers.size
    },
  })

  const hook = Object.freeze({
    get version(): string {
      return AXIOM_DEV_HOOK_VERSION
    },
    get mounted(): boolean {
      return state.mounted
    },
    get metrics() {
      return metrics
    },
    get profiling() {
      return profiling
    },
  }) satisfies AxiomDevHook

  Object.defineProperty(window, '__AXIOM__', {
    value: hook,
    configurable: true,
    enumerable: false,
    writable: false,
  })
}

function clearDevHook(): void {
  if (typeof window === 'undefined') return

  delete window.__AXIOM__
}

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
  textEngine?: TextLayoutEngine
  scheduler?: SchedulerFn
  router?: Router
  hydrate?: boolean
  strictHydration?: boolean
  hydrationDebug?: boolean
  onError?: (err: unknown, context: AppErrorContext) => void
  /** Stable identifier for this app instance. Auto-generated if absent. */
  appId?: string
  /**
   * Fired synchronously when Axiom detects an inline `transform` on an element
   * that was not written by the framework layout engine (e.g. a conflicting
   * CSS animation using the deprecated `transform` property instead of
   * `--animation-transform`).
   */
  onTransformConflict?: CommitOptions['onTransformConflict']
}

export type AppErrorPhase = 'prepare' | 'reflow' | 'commit' | 'hydrate'

export interface AppErrorContext {
  phase: AppErrorPhase
  displayName: string
  route: string
  cycle: number
  hydrated: boolean
  nodeKey?: string
}

export interface App {
  mount(): void
  unmount(): void
  getMetrics(): RenderMetrics
  enableProfiling(callback: ProfileSubscriber): () => void
  enableHotReloadRecovery(): void
  disableHotReloadRecovery(): void
}

type HotReloadMode = 'none' | 'partial' | 'fallback'

interface HotReloadState {
  enabled: boolean
  lastComponentId: symbol
  lastSourceFn: ComponentDefinition<void>['_fn']
  lastMode: HotReloadMode
}

interface AppState {
  prevPrepared: PreparedComponent | null
  prevLayout: LayoutResult | null
  domState: DOMState
  mounted: boolean
  stopEffect: (() => void) | null
  metrics: RenderMetrics
  profileCycle: number
  profileSubscribers: Set<ProfileSubscriber>
  hotReload: HotReloadState
}

export function createApp(
  component: ComponentDefinition<void>,
  root: HTMLElement,
  options?: AppOptions
): App {
  const rootDisplayName = resolveComponentDisplayName(component as ComponentDefinition<unknown>)
  const appId = options?.appId ?? generateAppId()
  const pluginCtx: PluginContext = { appId }

  const state: AppState = {
    prevPrepared: null,
    prevLayout: null,
    domState: { domNodes: [], portalRoots: new Map() },
    mounted: false,
    stopEffect: null,
    metrics: { prepareMs: 0, reflowMs: 0, commitMs: 0 },
    profileCycle: 0,
    profileSubscribers: new Set(),
    hotReload: {
      enabled: false,
      lastComponentId: component._id,
      lastSourceFn: component._fn,
      lastMode: 'none',
    },
  }

  const prepareOpts: PrepareOptions = {
    font: options?.font ?? '16px sans-serif',
    textEngine: options?.textEngine,
  }

  const reflowOpts: ReflowOptions = {
    lineHeight: options?.lineHeight ?? 20,
  }

  const commitOpts: CommitOptions = {
    onTransformConflict: options?.onTransformConflict,
  }

  const scheduler = options?.scheduler

  /**
   * Cached layout constraints. Refreshed ONLY on mount and on window/root resize —
   * never per update cycle. The `prepare -> reflow -> commit` hot path consumes
   * these plain cached values, so signal-driven updates in steady state perform
   * zero DOM reads (invariant S4, findings C-4/M-12).
   */
  let cachedConstraints: LayoutConstraints | null = null
  let rootResizeObserver: ResizeObserver | null = null

  function handleResize(): void {
    if (!state.mounted) return
    const previous = cachedConstraints
    const next = refreshConstraints()
    // Root height writes also notify the observer. Avoid no-op render loops.
    if (previous === null || Object.keys(next).some(key =>
      next[key as keyof LayoutConstraints] !== previous[key as keyof LayoutConstraints]
    )) scheduleRender(performUpdate, scheduler)
  }

  /**
   * Read the current container/viewport dimensions from the DOM and cache them.
   *
   * These are the ONLY intentional DOM reads in the framework. They run on
   * mount and on window/root resize, not per frame and not per update cycle:
   * 1. They happen BEFORE reflow() — they provide input, not feedback
   * 2. The result is cached and passed as plain values into the pure
   *    arithmetic pipeline of every subsequent cycle
   * 3. SSR-safe: no `window` access when `typeof window === 'undefined'`
   *
   * Each read line carries the `// dom-read-allowlist:` marker enforced by
   * tests/architecture/hot-path-dom-reads.test.ts, and the mount/resize-only
   * claim is behaviorally enforced by
   * tests/architecture/app-steady-state-dom-reads.test.ts.
   */
  function refreshConstraints(): LayoutConstraints {
    const hasWindow = typeof window !== 'undefined'
    const constraints: LayoutConstraints = {
      maxWidth: root.clientWidth || 800, // dom-read-allowlist: cached; mount and window/root resize only, never per update cycle
      maxHeight: root.clientHeight || 600, // dom-read-allowlist: cached; mount and window/root resize only, never per update cycle
      viewportWidth: hasWindow ? window.innerWidth : undefined, // dom-read-allowlist: cached; SSR-safe window read only on mount and resize
      viewportHeight: hasWindow ? window.innerHeight : undefined, // dom-read-allowlist: cached; SSR-safe window read only on mount and resize
    }
    cachedConstraints = constraints
    return constraints
  }

  /**
   * Return the cached layout constraints for this update cycle. Performs no
   * DOM read in steady state; the fallback refresh only fires if constraints
   * were never computed (e.g. getConstraints called before mount).
   */
  function getConstraints(): LayoutConstraints {
    return cachedConstraints ?? refreshConstraints()
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

  function resolveContextFromPrepared(
    phase: AppErrorPhase,
    cycle: number,
    prepared?: PreparedComponent
  ): AppErrorContext {
    const displayName = prepared !== undefined
      ? (getDebugDisplayName(prepared) ?? rootDisplayName)
      : rootDisplayName
    const route = prepared !== undefined
      ? (getDebugRoute(prepared) ?? displayName)
      : displayName

    return {
      phase,
      displayName,
      route,
      cycle,
      hydrated: options?.hydrate === true,
      nodeKey: undefined,
    }
  }

  function didComponentDefinitionChange(): boolean {
    if (!state.hotReload.enabled) return false
    return state.hotReload.lastComponentId !== component._id
      || state.hotReload.lastSourceFn !== component._fn
  }

  function updateHotReloadSnapshot(mode: HotReloadMode = 'none'): void {
    state.hotReload.lastComponentId = component._id
    state.hotReload.lastSourceFn = component._fn
    state.hotReload.lastMode = mode
  }

  function reportError(err: unknown, context: AppErrorContext): void {
    if (isDevEnvironment()) {
      console.error(
        `[Axiom:${context.phase}] ${context.displayName} @ ${context.route}`,
        { context, err }
      )
    }

    if (options?.onError !== undefined) {
      try {
        options.onError(err, context)
      } catch (onErrorCallbackErr) {
        if (isDevEnvironment()) {
          console.error('[Axiom:onError] El callback onError lanzó una excepción', onErrorCallbackErr)
        }
      }
    }
  }

  function performUpdate(): void {
    const cycle = ++state.profileCycle
    const cycleStart = performance.now()

    const t0 = performance.now()
    let prepared: PreparedComponent
    try {
      prepared = prepare(component, undefined, prepareOpts)
    } catch (err) {
      reportError(err, resolveContextFromPrepared('prepare', cycle))
      throw err
    }
    state.metrics.prepareMs = performance.now() - t0
    emitProfile(cycle, 'prepare', state.metrics.prepareMs)

    const t1 = performance.now()
    let layout: LayoutResult
    try {
      layout = reflow(prepared, getConstraints(), reflowOpts)
    } catch (err) {
      reportError(err, resolveContextFromPrepared('reflow', cycle, prepared))
      throw err
    }
    state.metrics.reflowMs = performance.now() - t1
    emitProfile(cycle, 'reflow', state.metrics.reflowMs)

    const t2 = performance.now()
    const shapeChanged = state.prevPrepared === null
      || !isSameTopology(state.prevPrepared, prepared)
    const definitionChanged = didComponentDefinitionChange()
    const partialRecoverySafe = definitionChanged
      && !shapeChanged
      && state.prevPrepared !== null
      && state.prevLayout !== null
    const requiresFallbackRecovery = definitionChanged && !partialRecoverySafe

    try {
      if (shapeChanged || requiresFallbackRecovery) {
        // Shape change (e.g. column count changed) — full teardown and re-commit.
        // applyOps can't handle hierarchy changes because it flat-appends inserts to root.
        fireUnmountEvents(state.domState.domNodes)
        // Clear portal targets BEFORE resetting root — they are outside root.innerHTML scope
        clearPortalRoots(state.domState)
        root.innerHTML = ''
        state.domState.domNodes = []
        state.domState.portalRoots = new Map()
        if (requiresFallbackRecovery) {
          // Hot reload incompatible change: deterministic internal refresh.
          // Use commitFull to avoid hydration mismatch loops during runtime recovery.
          commitFull(layout, prepared, root, state.domState, commitOpts)
        } else {
          commitFull(layout, prepared, root, state.domState, commitOpts)
        }
      } else {
        // Value change only — incremental diff and apply
        const ops = fullDiff(state.prevPrepared, state.prevLayout, prepared, layout, state.domState.domNodes)
        applyOps(ops, root, state.domState.domNodes, commitOpts)
        // Update root height (commitFull does this internally, but applyOps doesn't)
        const rootHeight = layout.height[0] ?? 0
         root.style.height = `${rootHeight}px`
      }
    } catch (err) {
      releaseLayoutResult(layout)
      // Also release the previous layout if commit threw mid-cycle; otherwise
      // it stays referenced in state.prevLayout until the next successful
      // performUpdate (which may never come). Clear prevPrepared too: keeping
      // a stale topology with no layout to diff against would make the next
      // fullDiff enter the value-change path with null prevLayout and skip
      // coordinate updates on same-index nodes.
      if (state.prevLayout !== null && state.prevLayout !== layout) {
        releaseLayoutResult(state.prevLayout)
        state.prevLayout = null
        state.prevPrepared = null
      }
      reportError(err, resolveContextFromPrepared('commit', cycle, prepared))
      throw err
    }

    if (requiresFallbackRecovery) {
      updateHotReloadSnapshot('fallback')
    } else if (partialRecoverySafe) {
      updateHotReloadSnapshot('partial')
    } else {
      updateHotReloadSnapshot('none')
    }

    state.metrics.commitMs = performance.now() - t2
    emitProfile(cycle, 'commit', state.metrics.commitMs)
    emitProfile(cycle, 'total', performance.now() - cycleStart)

    if (state.prevLayout !== null && state.prevLayout !== layout) {
      releaseLayoutResult(state.prevLayout)
    }

    state.prevPrepared = prepared
    state.prevLayout = layout
    applyPluginHook('onUpdate', pluginCtx)
  }

  function emitProfile(cycle: number, phase: ProfilePhase, durationMs: number): void {
    if (state.profileSubscribers.size === 0) return

    const event: ProfileEvent = { cycle, phase, durationMs }
    for (const subscriber of state.profileSubscribers) {
      subscriber(event)
    }
  }

  return {
    mount(): void {
      if (state.mounted) return

      const cycle = ++state.profileCycle
      const cycleStart = performance.now()

      // Read layout constraints once at mount and keep them fresh on resize
      // only — update cycles consume the cache (zero DOM reads in steady state).
      // The read feeds reflow, so failures are reported under the reflow phase.
      try {
        refreshConstraints()
      } catch (err) {
        reportError(err, resolveContextFromPrepared('reflow', cycle))
        throw err
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', handleResize)
      }

      // First render — synchronous, no rAF
      const t0 = performance.now()
      let prepared: PreparedComponent
      try {
        prepared = prepare(component, undefined, prepareOpts)
      } catch (err) {
        reportError(err, resolveContextFromPrepared('prepare', cycle))
        throw err
      }
      state.metrics.prepareMs = performance.now() - t0
      emitProfile(cycle, 'prepare', state.metrics.prepareMs)

      const t1 = performance.now()
      let layout: LayoutResult
      try {
        layout = reflow(prepared, getConstraints(), reflowOpts)
      } catch (err) {
        reportError(err, resolveContextFromPrepared('reflow', cycle, prepared))
        throw err
      }
      state.metrics.reflowMs = performance.now() - t1
      emitProfile(cycle, 'reflow', state.metrics.reflowMs)

      const t2 = performance.now()
      try {
        if (options?.hydrate === true) {
          try {
            commitHydrate(layout, prepared, root, state.domState, {
              strictMismatch: options.strictHydration,
              debug: options.hydrationDebug,
            }, commitOpts)
          } catch (err) {
            reportError(err, resolveContextFromPrepared('hydrate', cycle, prepared))
            throw err
          }
        } else {
          commitFull(layout, prepared, root, state.domState, commitOpts)
        }
      } catch (err) {
        releaseLayoutResult(layout)
        // Only report if this is NOT a hydration error that was already reported
        if (options?.hydrate !== true) {
          reportError(err, resolveContextFromPrepared('commit', cycle, prepared))
        }
        throw err
      }
      state.metrics.commitMs = performance.now() - t2
      emitProfile(cycle, 'commit', state.metrics.commitMs)
      emitProfile(cycle, 'total', performance.now() - cycleStart)

      if (state.prevLayout !== null && state.prevLayout !== layout) {
        releaseLayoutResult(state.prevLayout)
      }

      state.prevPrepared = prepared
      state.prevLayout = layout
      updateHotReloadSnapshot('none')
      state.mounted = true
      if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
        rootResizeObserver = new window.ResizeObserver(handleResize)
        rootResizeObserver.observe(root)
      }
      installDevHook(state)
      applyPluginHook('onMount', pluginCtx)

      // Wire reactivity — subsequent updates go through scheduler
      // The effect reads signals by calling component._fn() to establish dependencies
      // Then schedules the actual render
      state.stopEffect = effect(() => {
        if (!state.mounted) return
        // Read signals to establish dependencies
        component._fn(undefined as void)
        // Schedule the actual render directly with performUpdate reference
        scheduleRender(performUpdate, scheduler)
      })
    },

    unmount(): void {
      const wasMounted = state.mounted
      state.stopEffect?.()
      cancelScheduled()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize)
      }
      rootResizeObserver?.disconnect()
      rootResizeObserver = null
      cachedConstraints = null
      options?.router?.dispose?.()
      fireUnmountEvents(state.domState.domNodes)
      // Clear portal targets BEFORE wiping root — they live outside root DOM scope
      clearPortalRoots(state.domState)
      root.innerHTML = ''
      state.mounted = false
      state.prevPrepared = null
      if (state.prevLayout !== null) {
        releaseLayoutResult(state.prevLayout)
      }
      state.prevLayout = null
      // Replace the array reference (not just fill) to release all DOM node references
      // and allow the GC to collect them, preventing memory leaks in long-lived apps.
      state.domState.domNodes = []
      state.domState.portalRoots = new Map()
      updateHotReloadSnapshot('none')
      clearDevHook()
      if (wasMounted) applyPluginHook('onUnmount', pluginCtx)
    },

    getMetrics(): RenderMetrics {
      return { ...state.metrics }
    },

    enableProfiling(callback: ProfileSubscriber): () => void {
      state.profileSubscribers.add(callback)
      return () => {
        state.profileSubscribers.delete(callback)
      }
    },

    enableHotReloadRecovery(): void {
      state.hotReload.enabled = true
      updateHotReloadSnapshot(state.hotReload.lastMode)
    },

    disableHotReloadRecovery(): void {
      state.hotReload.enabled = false
      updateHotReloadSnapshot('none')
    },
  }
}
