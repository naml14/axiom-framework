// ============================================================
// Motion Essentials — per-property transition model
// Fase 4: Ruta B
// ============================================================
// Design invariants:
//  - NO rAF, NO timers. All scheduling through the scheduler fn passed in.
//  - Transitions are per-property, per-element state machines.
//  - Cancellation: new scheduleTransition() cancels any in-flight transition.
//  - Fallback: call applyImmediately() to skip animation and set value directly.
//  - This module is pure logic — it does not import scheduler or app internals.
//    The caller (app layer or component) provides the scheduler function.
// ============================================================

import type { SafeStyleKey } from './style.js'

// ---------------------------------------------------------------------------
// 1. Transition Definition
// ---------------------------------------------------------------------------

export type EasingFunction = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'

/**
 * Subset of style properties that can be animated.
 * Intentionally smaller than SafeStyleKey — only properties where
 * browser can interpolate the numeric/color value make sense here.
 */
export type TransitionProperty = Extract<
  SafeStyleKey,
  | 'opacity'
  | 'color'
  | 'backgroundColor'
  | 'borderColor'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'transform'
  | 'borderRadius'
  | 'padding'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
>

export interface TransitionOptions {
  duration: number
  easing?: EasingFunction
  delay?: number
}

export interface TransitionDefinition {
  property: TransitionProperty
  duration: number
  easing: EasingFunction
  delay: number
}

/**
 * Create a validated TransitionDefinition for a given CSS property.
 *
 * @param property — The CSS property to animate
 * @param options — duration (required), easing and delay (optional)
 * @throws if duration is <= 0
 */
export function createTransition(
  property: TransitionProperty,
  options: TransitionOptions
): TransitionDefinition {
  if (options.duration <= 0) {
    throw new Error(`[axiom/animation] transition duration must be > 0, got: ${options.duration}`)
  }
  return {
    property,
    duration: options.duration,
    easing: options.easing ?? 'ease',
    delay: options.delay ?? 0,
  }
}

// ---------------------------------------------------------------------------
// 2. Animation State — per-element in-flight state machine
// ---------------------------------------------------------------------------

export interface ActiveTransition {
  transition: TransitionDefinition
  from: string
  to: string
  /** Epoch ms when this transition was scheduled */
  startTime: number
}

export interface AnimationState {
  activeTransition: ActiveTransition | null
}

/**
 * Create a new isolated AnimationState for an element.
 * Each element that can be animated must have its own state instance.
 */
export function createAnimationState(): AnimationState {
  return { activeTransition: null }
}

// ---------------------------------------------------------------------------
// 3. State Queries
// ---------------------------------------------------------------------------

/**
 * Returns true if there is an active (in-flight) transition on this state.
 */
export function isTransitioning(state: AnimationState): boolean {
  return state.activeTransition !== null
}

/**
 * Returns the current progress [0, 1] of the active transition.
 * Progress is clamped at 1 — does not exceed 1.
 * Returns 0 if no transition is active.
 */
export function getTransitionProgress(state: AnimationState): number {
  if (state.activeTransition === null) return 0

  const { startTime, transition } = state.activeTransition
  const elapsed = Date.now() - startTime
  if (elapsed <= 0) return 0

  const raw = (elapsed - transition.delay) / transition.duration
  return Math.min(1, Math.max(0, raw))
}

// ---------------------------------------------------------------------------
// 4. Transition Scheduling
// ---------------------------------------------------------------------------

type SchedulerFn = (tick: () => void) => void

/**
 * Start a coordinated transition for an element.
 *
 * - Cancels any in-flight transition on this state (cancellation rule).
 * - Records the `from` and `to` values for interpolation.
 * - Calls the provided scheduler function once to coordinate the tick.
 * - Does NOT call requestAnimationFrame directly.
 *
 * @param state — The element's AnimationState
 * @param transition — The TransitionDefinition to apply
 * @param values — { from, to } as CSS value strings
 * @param scheduler — Scheduler function to coordinate the refresh tick
 */
export function scheduleTransition(
  state: AnimationState,
  transition: TransitionDefinition,
  values: { from: string; to: string },
  scheduler: SchedulerFn
): void {
  // Cancellation rule: clear any previous in-flight transition
  if (state.activeTransition !== null) {
    state.activeTransition = null
  }

  // Record new transition
  state.activeTransition = {
    transition,
    from: values.from,
    to: values.to,
    startTime: Date.now(),
  }

  // Coordinate through scheduler — exactly one call per transition
  scheduler(() => {
    // This tick callback is called by the scheduler when a frame is available.
    // The caller is responsible for actually applying the interpolated value
    // to the DOM (via applyImmediately or el.style) after checking progress.
    // We do not read DOM here — this is pure state coordination.
  })
}

// ---------------------------------------------------------------------------
// 5. Cancellation
// ---------------------------------------------------------------------------

/**
 * Explicitly cancel any in-flight transition on this state.
 *
 * Safe to call even when no transition is active.
 */
export function cancelTransition(state: AnimationState): void {
  state.activeTransition = null
}

// ---------------------------------------------------------------------------
// 6. Immediate Fallback — apply final value without animation
// ---------------------------------------------------------------------------

/**
 * Apply a CSS value directly to an element, bypassing animation.
 *
 * Use this as a fallback when the scheduler is unavailable,
 * or to finalize a completed transition.
 *
 * Write-only — never reads from el.style.
 */
export function applyImmediately(
  el: HTMLElement,
  property: TransitionProperty,
  value: string
): void {
  ;(el.style as unknown as Record<string, unknown>)[property] = value
}
