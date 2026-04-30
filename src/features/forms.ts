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

export type ValidationRule<T> = SyncRule<T> | AsyncRule<T>

export interface ValidationResult {
  valid: boolean
  errors: string[]
  pending: boolean
}

export interface ValidateOptions {
  debounceMs?: number
}

type BindableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

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
    if (rule.type === 'async') continue
    const result = rule.validate(value)
    if (result !== null) {
      errors.push(result)
      return errors
    }
  }
  return errors
}

async function runAsyncRules<T>(value: T, rules: ValidationRule<T>[]): Promise<string[]> {
  for (const rule of rules) {
    if (rule.type === 'sync') continue
    const result = await rule.validate(value)
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
  const result = signal<ValidationResult>({
    valid: true,
    errors: [],
    pending: false,
  })

  let generation = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const hasAsyncRules = rules.some((r) => r.type === 'async')

  // effect() returns a dispose function — store it to prevent memory leaks
  const disposeEffect = effect(() => {
    const val = source.value // track dependency

    // Run sync rules first (fail-fast)
    const syncErrors = runSyncRules(val, rules)
    if (syncErrors.length > 0) {
      // Cancel any pending async debounce
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      result.value = { valid: false, errors: syncErrors, pending: false }
      return
    }

    // All sync rules passed
    if (!hasAsyncRules) {
      // No async rules — we're done
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      result.value = { valid: true, errors: [], pending: false }
      return
    }

    // Has async rules — set pending and debounce
    generation++
    const currentGen = generation

    // Cancel previous debounce timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }

    result.value = { valid: true, errors: [], pending: true }

    debounceTimer = setTimeout(async () => {
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
      debounceTimer = null
    }, debounceMs)
  })

  // Expose dispose to allow callers to clean up the internal effect and any pending timer
  const dispose = () => {
    disposeEffect()
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  return Object.assign(result, { dispose })
}

// ============================================================
// Built-in validation rule factories
// ============================================================

export const required: SyncRule<string> = {
  type: 'sync',
  validate: (value: string) => {
    return value.trim().length === 0 ? 'This field is required' : null
  },
}

export function minLength(min: number): SyncRule<string> {
  return {
    type: 'sync',
    validate: (value: string) => {
      return value.length < min ? `Must be at least ${min} characters` : null
    },
  }
}

export function maxLength(max: number): SyncRule<string> {
  return {
    type: 'sync',
    validate: (value: string) => {
      return value.length > max ? `Must be at most ${max} characters` : null
    },
  }
}

export function pattern(regex: RegExp, message?: string): SyncRule<string> {
  return {
    type: 'sync',
    validate: (value: string) => {
      return regex.test(value) ? null : message ?? `Does not match required pattern`
    },
  }
}
