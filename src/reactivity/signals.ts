import type { Signal, SignalOptions, SignalKind, ComputedSignal } from '../core/types.js'

// ============================================================
// Internal data structures
// ============================================================

type EffectCleanup = () => void

interface EffectNode {
  _tag: 'effect'
  fn: () => void | EffectCleanup
  cleanup: EffectCleanup | null
  deps: Set<ReactiveNode>
}

interface ComputedNode<T> {
  _tag: 'computed'
  _fn: () => T
  _value: T | undefined
  _version: number
  _depVersions: Map<ReactiveNode, number>
  _computing: boolean
}

// Reactive node — _subs ONLY contains EffectNodes (push-based)
// ComputedNodes are pull-based (version check), never in _subs
interface ReactiveNode {
  _subs: Set<EffectNode>
  _version: number
}

interface SignalInternal<T> extends ReactiveNode {
  _value: T
  _kind: SignalKind
}

// ============================================================
// Global reactive context
// ============================================================

let activeEffect: EffectNode | null = null
let executionDepth = 0
const MAX_DEPTH = 100

// ============================================================
// Signal
// ============================================================

export function signal<T>(initialValue: T, options?: SignalOptions): Signal<T> {
  const internal: SignalInternal<T> = {
    _value: initialValue,
    _version: 0,
    _subs: new Set(),
    _kind: options?.kind ?? 'shape',
  }

  return {
    get value(): T {
      trackDependency(internal)
      return internal._value
    },
    set value(v: T) {
      if (Object.is(internal._value, v)) return
      internal._value = v
      internal._version++
      notifySubscribers(internal)
    },
  }
}

// ============================================================
// Effect
// ============================================================

export function effect(fn: () => void | EffectCleanup): () => void {
  const node: EffectNode = {
    _tag: 'effect',
    fn,
    cleanup: null,
    deps: new Set(),
  }

  executeEffect(node)

  return () => {
    disposeEffect(node)
  }
}

// ============================================================
// Computed
// ============================================================

export function computed<T>(fn: () => T): ComputedSignal<T> {
  const internal: ComputedNode<T> = {
    _tag: 'computed',
    _fn: fn,
    _value: undefined as T | undefined,
    _version: 0,
    _depVersions: new Map(),
    _computing: false,
  }

  return {
    get value(): T {
      if (isStale(internal) || internal._value === undefined) {
        evaluateComputed(internal)
      }
      registerTransitiveDeps(internal)
      return internal._value as T
    },
    set value(_v: T) {
      throw new Error('Cannot set value of a computed signal')
    },
  }
}

// ============================================================
// Internal helpers
// ============================================================

function trackDependency(node: ReactiveNode): void {
  if (activeEffect !== null) {
    node._subs.add(activeEffect)
    activeEffect.deps.add(node)
  }
}

function notifySubscribers(node: ReactiveNode): void {
  const subs = [...node._subs]
  for (const sub of subs) {
    executeEffect(sub)
  }
}

function executeEffect(node: EffectNode): void {
  clearDeps(node)
  runCleanup(node)

  executionDepth++
  if (executionDepth > MAX_DEPTH) {
    executionDepth--
    throw new Error('Infinite loop detected: effect depth exceeded maximum')
  }

  const prevEffect = activeEffect
  activeEffect = node

  try {
    const result = node.fn()
    if (typeof result === 'function') {
      node.cleanup = result as EffectCleanup
    }
  } finally {
    activeEffect = prevEffect
    executionDepth--
  }
}

function clearDeps(node: EffectNode): void {
  for (const dep of node.deps) {
    dep._subs.delete(node)
  }
  node.deps.clear()
}

function runCleanup(node: EffectNode): void {
  if (node.cleanup !== null) {
    node.cleanup()
    node.cleanup = null
  }
}

function disposeEffect(node: EffectNode): void {
  clearDeps(node)
  runCleanup(node)
}

function isStale(internal: ComputedNode<unknown>): boolean {
  for (const [dep, ver] of internal._depVersions) {
    if (dep._version !== ver) return true
  }
  return false
}

function evaluateComputed(internal: ComputedNode<unknown>): void {
  if (internal._computing) {
    throw new Error('Circular dependency detected in computed signal')
  }

  internal._depVersions.clear()
  internal._computing = true

  const prevEffect = activeEffect
  const tracker: EffectNode = {
    _tag: 'effect',
    fn: () => {},
    cleanup: null,
    deps: new Set(),
  }
  activeEffect = tracker

  try {
    internal._value = internal._fn()
    for (const dep of tracker.deps) {
      internal._depVersions.set(dep, dep._version)
      dep._subs.delete(tracker)
    }
    internal._version++
  } finally {
    internal._computing = false
    activeEffect = prevEffect
  }
}

function registerTransitiveDeps(internal: ComputedNode<unknown>): void {
  if (activeEffect !== null) {
    for (const dep of internal._depVersions.keys()) {
      dep._subs.add(activeEffect)
      activeEffect.deps.add(dep)
    }
  }
}
