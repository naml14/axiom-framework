// ============================================================
// forms.ts — Two-way binding + reactive validation
// Built on top of signal() and effect() from signals.ts.
// Zero modifications to core pipeline files.
// ============================================================

import { signal, effect } from '../reactivity/signals.js'
import type { Signal } from '../core/types.js'

// ============================================================
// Types
// ============================================================

export interface SyncRule<T> {
  type: 'sync'
  validate: (value: T) => string | null
}

export interface AsyncRule<T> {
  type: 'async'
  validate: (value: T) => Promise<string | null>
}

export type SyncRuleFunction<T> = (value: T) => string | null
export type AsyncRuleFunction<T> = (value: T) => Promise<string | null>
export type ValidationRule<T> = SyncRule<T> | AsyncRule<T> | SyncRuleFunction<T> | AsyncRuleFunction<T>

export interface ValidationResult {
  valid: boolean
  errors: string[]
  pending: boolean
}

export interface ValidateOptions {
  debounceMs?: number
  /**
   * Optional scheduler for the debounce delay. Receives the callback to run
   * and the delay in milliseconds, and must return a function that cancels
   * the pending callback. Defaults to `setTimeout` when omitted.
   *
   * This is NOT interchangeable with the render scheduler passed to
   * `createApp({ scheduler })`: that one batches frames (`(cb) => void`) and
   * owns neither the delay nor a cancellation handle. Handing it over does not
   * type-check; wrap it in an adapter that implements this contract.
   *
   * Injecting it makes debounced async validation cancellable
   * deterministically (including on app unmount) and testable with a fake
   * scheduler instead of real time.
   */
  scheduler?: DebounceSchedulerFn
}

/**
 * Debounce scheduler contract for `ValidateOptions.scheduler`.
 *
 * Schedules `callback` after `delayMs` and returns a function that cancels the
 * pending callback. The default implementation uses `setTimeout`; callers can
 * inject a custom one via `ValidateOptions.scheduler`.
 *
 * Deliberately not named `SchedulerFn`: that name belongs to the render
 * scheduler in `src/scheduler.ts`, and sharing it hid the fact that the two
 * contracts are incompatible.
 */
export type DebounceSchedulerFn = (callback: () => void, delayMs: number) => () => void

type BindableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const AsyncFunctionConstructor = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor

function isAsyncFunctionRule<T>(rule: ValidationRule<T>): rule is AsyncRuleFunction<T> {
  return typeof rule === 'function' && rule instanceof AsyncFunctionConstructor
}

function isSyncRuleDescriptor<T>(rule: ValidationRule<T>): rule is SyncRule<T> {
  return typeof rule !== 'function' && rule.type === 'sync'
}

function isAsyncRuleDescriptor<T>(rule: ValidationRule<T>): rule is AsyncRule<T> {
  return typeof rule !== 'function' && rule.type === 'async'
}

// ============================================================
// ADR-4: bind() — effect for signal→DOM, addEventListener for DOM→signal
// ============================================================

export function bind(sig: Signal<string>, el: BindableElement): () => void {
  // Guard: must be a bindable element (ADR-4)
  // Note: in runtime (happy-dom/browser), instanceof checks work correctly
  const elAny = el as unknown
  if (
    !(elAny instanceof HTMLInputElement) &&
    !(elAny instanceof HTMLTextAreaElement) &&
    !(elAny instanceof HTMLSelectElement)
  ) {
    throw new TypeError(
      `bind() requires an HTMLInputElement, HTMLTextAreaElement, or HTMLSelectElement. Got: ${(el as { constructor?: { name?: string } }).constructor?.name ?? typeof el}`
    )
  }

  // signal → DOM (via effect — tracks signal dependency automatically)
  const stopEffect = effect(() => {
    el.value = String(sig.value)
  })

  // DOM → signal (via input event listener)
  // Using el.value directly from the closure is more robust than (e.target as HTMLInputElement).value:
  // it avoids incorrect casts for textarea/select, and is immune to event bubbling
  // where e.target might point to a child element instead of the bound element.
  const handler = () => {
    sig.value = el.value
  }
  el.addEventListener('input', handler)

  // Return dispose function that tears down both subscriptions
  return () => {
    stopEffect()
    el.removeEventListener('input', handler)
  }
}

// ============================================================
// ADR-5: validate() — Signal<ValidationResult> driven by effect()
// ADR-6: debounce + generation counter for async rules
// ============================================================

function runSyncRules<T>(value: T, rules: ValidationRule<T>[]): string[] {
  const errors: string[] = []
  for (const rule of rules) {
    if (isAsyncRuleDescriptor(rule) || isAsyncFunctionRule(rule)) continue
    const result = typeof rule === 'function' ? rule(value) : rule.validate(value)
    if (result !== null) {
      errors.push(result)
      return errors
    }
  }
  return errors
}

async function runAsyncRules<T>(value: T, rules: ValidationRule<T>[]): Promise<string[]> {
  for (const rule of rules) {
    if (isSyncRuleDescriptor(rule) || (typeof rule === 'function' && !isAsyncFunctionRule(rule))) continue
    const result = await (typeof rule === 'function' ? rule(value) : rule.validate(value))
    if (result !== null) {
      return [result]
    }
  }
  return []
}

export function validate<T>(
  source: Signal<T>,
  rules: ValidationRule<T>[],
  options?: ValidateOptions
): Signal<ValidationResult> & { dispose: () => void } {
  const debounceMs = options?.debounceMs ?? 300
  // Default debounce scheduler: setTimeout. A custom DebounceSchedulerFn
  // overrides it so debounced validation stays cancellable and testable
  // without real timers.
  const schedule: DebounceSchedulerFn = options?.scheduler
    ?? ((cb: () => void, ms: number) => {
        const id = setTimeout(cb, ms)
        return () => clearTimeout(id)
      })
  const result = signal<ValidationResult>({
    valid: true,
    errors: [],
    pending: false,
  })

  let generation = 0
  let cancelPending: (() => void) | null = null

  const hasAsyncRules = rules.some((r) => isAsyncRuleDescriptor(r) || isAsyncFunctionRule(r))

  // effect() returns a dispose function — store it to prevent memory leaks
  const disposeEffect = effect(() => {
    const val = source.value // track dependency

    // Run sync rules first (fail-fast)
    const syncErrors = runSyncRules(val, rules)
    if (syncErrors.length > 0) {
      // Cancel any pending async debounce
      if (cancelPending !== null) {
        cancelPending()
        cancelPending = null
      }
      result.value = { valid: false, errors: syncErrors, pending: false }
      return
    }

    // All sync rules passed
    if (!hasAsyncRules) {
      // No async rules — we're done
      if (cancelPending !== null) {
        cancelPending()
        cancelPending = null
      }
      result.value = { valid: true, errors: [], pending: false }
      return
    }

    // Has async rules — set pending and debounce
    generation++
    const currentGen = generation

    // Cancel previous debounce timer
    if (cancelPending !== null) {
      cancelPending()
    }

    result.value = { valid: true, errors: [], pending: true }

    cancelPending = schedule(async () => {
      // Stale check (generation counter — ADR-6)
      if (currentGen !== generation) return

      const asyncErrors = await runAsyncRules(val, rules)

      // Second stale check after await
      if (currentGen !== generation) return

      result.value = {
        valid: asyncErrors.length === 0,
        errors: asyncErrors,
        pending: false,
      }
      cancelPending = null
    }, debounceMs)
  })

  // Expose dispose to allow callers to clean up the internal effect and any pending timer
  const dispose = () => {
    disposeEffect()
    if (cancelPending !== null) {
      cancelPending()
      cancelPending = null
    }
  }

  return Object.assign(result, { dispose })
}

// ============================================================
// Built-in validation rule factories
// ============================================================

export const required: SyncRuleFunction<string> = (value: string) => {
  return value.trim().length === 0 ? 'This field is required' : null
}

export function minLength(min: number): SyncRuleFunction<string> {
  return (value: string) => {
    return value.length < min ? `Must be at least ${min} characters` : null
  }
}

export function maxLength(max: number): SyncRuleFunction<string> {
  return (value: string) => {
    return value.length > max ? `Must be at most ${max} characters` : null
  }
}

export function pattern(regex: RegExp, message?: string): SyncRuleFunction<string> {
  return (value: string) => {
    return regex.test(value) ? null : message ?? `Does not match required pattern`
  }
}
