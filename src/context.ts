// ============================================================
// context.ts — Tree-scoped reactive context + module-level store
// Built on top of signal() from signals.ts. Zero pipeline changes.
// ============================================================

import { signal } from './signals.js'
import type { Signal } from './types.js'

// ============================================================
// Types
// ============================================================

export interface Context<T> {
  readonly _id: symbol
  readonly _defaultValue: T
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
  }
}

// ============================================================
// withContext — Provider HOF (ADR-3: plain function, not defineComponent)
// Pushes context value onto the stack, calls children, pops.
// Returns whatever children() returns — transparent to the pipeline.
// ============================================================

export function withContext<T, R>(
  ctx: Context<T>,
  value: Signal<T> | T,
  children: () => R
): R {
  // Normalize: wrap plain value in signal if needed
  const sig: Signal<T> =
    value !== null &&
    typeof value === 'object' &&
    'value' in (value as object) &&
    typeof (value as Signal<T>).value !== 'undefined'
      ? (value as Signal<T>)
      : signal(value as T)

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
    if (frame.has(ctx._id)) {
      return frame.get(ctx._id) as Signal<T>
    }
  }
  // Default: wrap defaultValue in a signal (always returns Signal<T>)
  return signal(ctx._defaultValue)
}

// ============================================================
// ADR-2: createStore — module-level singleton DI
// provideStore/injectStore use the same call-stack mechanism
// ============================================================

// Each store instance gets its own symbol key for the DI stack
const storeKeyMap = new WeakMap<StoreInstance<unknown>, symbol>()
const storeStack: Map<symbol, StoreInstance<unknown>>[] = []

function getStoreKey<T>(store: StoreInstance<T>): symbol {
  const key = storeKeyMap.get(store as StoreInstance<unknown>)
  if (key !== undefined) return key
  const newKey = Symbol('Store')
  storeKeyMap.set(store as StoreInstance<unknown>, newKey)
  return newKey
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
  const key = getStoreKey(store)
  const frame = new Map<symbol, StoreInstance<unknown>>()
  frame.set(key, store as StoreInstance<unknown>)
  storeStack.push(frame)
  try {
    children()
  } finally {
    storeStack.pop()
  }
}

export function injectStore<T>(store: StoreInstance<T>): StoreInstance<T> {
  const key = getStoreKey(store)
  for (let i = storeStack.length - 1; i >= 0; i--) {
    const frame = storeStack[i]
    if (frame.has(key)) {
      return frame.get(key) as StoreInstance<T>
    }
  }
  // Not provided — return the same store (module-level singleton usage)
  return store
}
