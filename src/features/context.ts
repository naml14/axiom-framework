// ============================================================
// context.ts — Tree-scoped reactive context + module-level store
// Built on top of signal() from signals.ts. Zero pipeline changes.
// ============================================================

import { signal } from '../reactivity/signals.js'
import type { Signal } from '../core/types.js'

// ============================================================
// Types
// ============================================================

export function isSignal<T>(value: unknown): value is Signal<T> {
  return value !== null && typeof value === 'object' && 'value' in (value as object)
}


export interface Context<T> {
  readonly _id: symbol
  readonly _defaultValue: T
  /** Memoized Signal<T> for the default value — shared across all useContext() calls without a Provider.
   *  This ensures two consumers of the same context without a Provider receive the same reactive signal
   *  instead of independent, unrelated signals. */
  readonly _defaultSignal: Signal<T>
}

export interface StoreInstance<T> {
  readonly state: Signal<T>
  setState(value: T): void
  setState(updater: (prev: T) => T): void
}

// ============================================================
// ADR-1: Call-stack scoping via module-level contextStack
// Each entry is a Map from Context symbol id to the injected Signal<unknown>
// ============================================================

const contextStack: Map<symbol, Signal<unknown>>[] = []

// ============================================================
// createContext
// ============================================================

export function createContext<T>(defaultValue: T): Context<T> {
  return {
    _id: Symbol('Context'),
    _defaultValue: defaultValue,
    _defaultSignal: signal(defaultValue),
  }
}

// ============================================================
// withContext — Provider HOF (ADR-3: plain function, not defineComponent)
// Pushes context value onto the stack, calls children, pops.
// Returns whatever children() returns — transparent to the pipeline.
//
// NOTE: context scoping is synchronous by design (same as React/Solid.js).
// If children() is async, the contextStack.pop() runs when the initial Promise
// is returned — before any code after internal `await`s executes. Any useContext()
// calls after an `await` inside children will NOT see this provider. This is
// intentional and documented in ADR-1.
// ============================================================

export function withContext<T, R>(
  ctx: Context<T>,
  value: Signal<T> | T,
  children: () => R
): R {
  const sig: Signal<T> = isSignal(value) ? value : signal(value as T)

  const frame = new Map<symbol, Signal<unknown>>()
  frame.set(ctx._id, sig as Signal<unknown>)
  contextStack.push(frame)

  try {
    return children()
  } finally {
    contextStack.pop()
  }
}

// ============================================================
// useContext — reads from the top of the call-stack
// Returns Signal<T> — reactive by default
// ============================================================

export function useContext<T>(ctx: Context<T>): Signal<T> {
  // Search from top of stack to bottom (innermost wins — ADR-1)
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const frame = contextStack[i]
    if (frame !== undefined && frame.has(ctx._id)) {
      return frame.get(ctx._id) as Signal<T>
    }
  }
  // Default: return the memoized signal — ensures all consumers without a Provider
  // share the same reactive Signal<T> instance (consistent and memory-efficient).
  return ctx._defaultSignal
}

// ============================================================
// ADR-2: createStore — module-level singleton DI
// provideStore/injectStore are now implemented via withContext/useContext,
// reusing the same contextStack mechanism (eliminates the duplicate storeStack).
// ============================================================

// Each StoreInstance gets its own Context<StoreInstance<T>> for DI scoping.
// We use a WeakMap so the Context is created once per store and reused on
// subsequent provideStore/injectStore calls for the same instance.
const storeContextMap = new WeakMap<StoreInstance<unknown>, Context<StoreInstance<unknown>>>()

function getStoreContext<T>(store: StoreInstance<T>): Context<StoreInstance<T>> {
  const existing = storeContextMap.get(store as StoreInstance<unknown>)
  if (existing !== undefined) return existing as Context<StoreInstance<T>>
  const ctx = createContext<StoreInstance<T>>(store)
  storeContextMap.set(store as StoreInstance<unknown>, ctx as Context<StoreInstance<unknown>>)
  return ctx
}

export function createStore<T>(initialState: T): StoreInstance<T> {
  const state = signal<T>(initialState)

  function setState(valueOrUpdater: T | ((prev: T) => T)): void {
    if (typeof valueOrUpdater === 'function') {
      state.value = (valueOrUpdater as (prev: T) => T)(state.value)
    } else {
      state.value = valueOrUpdater
    }
  }

  const store: StoreInstance<T> = { state, setState }
  return store
}

export function provideStore<T>(store: StoreInstance<T>, children: () => void): void {
  const ctx = getStoreContext(store)
  withContext(ctx, store, children)
}

export function injectStore<T>(store: StoreInstance<T>): StoreInstance<T> {
  const ctx = getStoreContext(store)
  return useContext(ctx).value
}
