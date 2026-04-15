// ============================================================
// Motion Essentials — unit contracts (TDD red → green)
// Fase 4: Ruta B
// ============================================================
// Design invariants:
//  - No rAF, no timers — coordinated exclusively through scheduler
//  - Transitions are per-property objects, not global anime strings
//  - Cancellation: new update while in-flight cancels previous transition
//  - Fallback: if scheduler not available, apply final value immediately
//  - No DOM reads in any hot path
// ============================================================

import { describe, it, expect, beforeEach, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import {
  createTransition,
  createAnimationState,
  scheduleTransition,
  cancelTransition,
  applyImmediately,
  getTransitionProgress,
  isTransitioning,
} from '../src/animation.js'
import type {
  TransitionDefinition,
  AnimationState,
  TransitionProperty,
} from '../src/animation.js'

// Setup happy-dom for DOM tests
beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
})

// ---------------------------------------------------------------------------
// 1. TransitionDefinition — per-property contracts
// ---------------------------------------------------------------------------
describe('createTransition', () => {
  it('creates a transition definition with required fields', () => {
    const t = createTransition('opacity', {
      duration: 200,
      easing: 'ease-in-out',
    })
    expect(t.property).toBe('opacity')
    expect(t.duration).toBe(200)
    expect(t.easing).toBe('ease-in-out')
  })

  it('defaults easing to "ease" when not specified', () => {
    const t = createTransition('color', { duration: 300 })
    expect(t.easing).toBe('ease')
  })

  it('defaults delay to 0', () => {
    const t = createTransition('opacity', { duration: 150 })
    expect(t.delay).toBe(0)
  })

  it('accepts delay override', () => {
    const t = createTransition('opacity', { duration: 150, delay: 50 })
    expect(t.delay).toBe(50)
  })

  it('rejects duration <= 0', () => {
    expect(() => createTransition('opacity', { duration: 0 })).toThrow(/duration/)
    expect(() => createTransition('opacity', { duration: -1 })).toThrow(/duration/)
  })

  it('only accepts valid TransitionProperty values', () => {
    const valid: TransitionProperty[] = ['opacity', 'color', 'backgroundColor', 'transform', 'fontSize']
    for (const prop of valid) {
      expect(() => createTransition(prop, { duration: 100 })).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. AnimationState — per-element in-flight state
// ---------------------------------------------------------------------------
describe('createAnimationState', () => {
  it('creates initial idle state', () => {
    const state = createAnimationState()
    expect(isTransitioning(state)).toBe(false)
    expect(getTransitionProgress(state)).toBe(0)
  })

  it('returns an isolated state object (not shared)', () => {
    const a = createAnimationState()
    const b = createAnimationState()
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// 3. scheduleTransition — start a coordinated transition
// ---------------------------------------------------------------------------
describe('scheduleTransition', () => {
  let mockSchedulerCallCount: number
  let mockCapturedCallback: (() => void) | undefined

  const mockScheduler = (cb: () => void) => {
    mockSchedulerCallCount++
    mockCapturedCallback = cb
  }

  beforeEach(() => {
    mockSchedulerCallCount = 0
    mockCapturedCallback = undefined
  })

  it('transitions to in-flight state immediately', () => {
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 200 })
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)
    expect(isTransitioning(state)).toBe(true)
  })

  it('calls the scheduler exactly once per transition', () => {
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 200 })
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)
    expect(mockSchedulerCallCount).toBe(1)
  })

  it('cancels in-flight transition when new one starts (cancellation rule)', () => {
    const state = createAnimationState()
    const t1 = createTransition('opacity', { duration: 300 })
    const t2 = createTransition('opacity', { duration: 150 })

    scheduleTransition(state, t1, { from: '0', to: '1' }, mockScheduler)
    // Start a new one — should cancel first
    scheduleTransition(state, t2, { from: '0.5', to: '0' }, mockScheduler)

    // The new one should be the active transition
    expect(state.activeTransition?.transition.duration).toBe(150)
    // Scheduler called for each transition
    expect(mockSchedulerCallCount).toBe(2)
  })

  it('advances progress when tick callback is invoked', () => {
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 200 })
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)

    // Simulate a frame tick at 100ms (50% progress)
    state.activeTransition!.startTime = Date.now() - 100
    const progress = getTransitionProgress(state)
    expect(progress).toBeGreaterThan(0)
    expect(progress).toBeLessThanOrEqual(1)
  })

  it('marks as complete when duration has elapsed', () => {
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 100 })
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)

    // Simulate frame at duration end
    state.activeTransition!.startTime = Date.now() - 200 // past duration

    const progress = getTransitionProgress(state)
    expect(progress).toBe(1)
    expect(isTransitioning(state)).toBe(true) // still in-flight until tick clears it
  })
})

// ---------------------------------------------------------------------------
// 4. cancelTransition — explicit cancellation
// ---------------------------------------------------------------------------
describe('cancelTransition', () => {
  it('cancels an in-flight transition', () => {
    const mockScheduler = (_cb: () => void) => {}
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 200 })
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)

    expect(isTransitioning(state)).toBe(true)
    cancelTransition(state)
    expect(isTransitioning(state)).toBe(false)
  })

  it('is a no-op if not transitioning', () => {
    const state = createAnimationState()
    expect(() => cancelTransition(state)).not.toThrow()
    expect(isTransitioning(state)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. applyImmediately — fallback when scheduler unavailable
// ---------------------------------------------------------------------------
describe('applyImmediately', () => {
  it('applies final style value directly to element', () => {
    const el = document.createElement('div')
    applyImmediately(el, 'opacity', '0.5')
    expect(el.style.opacity).toBe('0.5')
  })

  it('applies color value directly', () => {
    const el = document.createElement('div')
    applyImmediately(el, 'backgroundColor', 'red')
    expect(el.style.backgroundColor).toBe('red')
  })

  it('overrides existing style value', () => {
    const el = document.createElement('div')
    el.style.opacity = '0.3'
    applyImmediately(el, 'opacity', '1')
    expect(el.style.opacity).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// 6. Integration — transition coordinates through scheduler, not rAF
// ---------------------------------------------------------------------------
describe('Motion integration — scheduler coordination', () => {
  it('does not call requestAnimationFrame directly', () => {
    // Replace rAF to detect if it's called
    const originalRAF = globalThis.requestAnimationFrame
    let rafCalled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).requestAnimationFrame = () => { rafCalled = true; return 0 }

    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 200 })
    const mockScheduler = (_cb: () => void) => {}
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)

    expect(rafCalled).toBe(false)

    // Restore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).requestAnimationFrame = originalRAF
  })

  it('transitions apply final value when progress reaches 1', () => {
    const el = document.createElement('div')
    const state = createAnimationState()
    const t = createTransition('opacity', { duration: 100 })
    const mockScheduler = (_cb: () => void) => {}
    scheduleTransition(state, t, { from: '0', to: '1' }, mockScheduler)

    // Simulate elapsed > duration → progress clamped to 1
    state.activeTransition!.startTime = Date.now() - 200
    const progress = getTransitionProgress(state)
    expect(progress).toBe(1)

    // Apply final value and clear
    const { from, to } = state.activeTransition!
    const finalValue = progress === 1 ? to : from
    applyImmediately(el, t.property, finalValue)
    cancelTransition(state)

    expect(el.style.opacity).toBe('1')
    expect(isTransitioning(state)).toBe(false)
  })
})
