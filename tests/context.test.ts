import { describe, test, expect } from 'bun:test'
import { createContext, withContext, useContext, createStore, provideStore, injectStore } from '../src/features/context.js'
import { signal } from '../src/reactivity/signals.js'

describe('createContext', () => {
  test('returns default value when no Provider present', () => {
    const ctx = createContext<string>('default')
    const result = useContext(ctx)
    expect(result.value).toBe('default')
  })

  test('Provider injects value to useContext', () => {
    const ctx = createContext<string>('default')
    const injected = signal('injected')
    let capturedValue: string | undefined

    withContext(ctx, injected, () => {
      capturedValue = useContext(ctx).value
    })

    expect(capturedValue).toBe('injected')
  })

  test('nested Provider: innermost wins', () => {
    const ctx = createContext<string>('default')
    const outer = signal('outer')
    const inner = signal('inner')
    let capturedOuter: string | undefined
    let capturedInner: string | undefined

    withContext(ctx, outer, () => {
      capturedOuter = useContext(ctx).value
      withContext(ctx, inner, () => {
        capturedInner = useContext(ctx).value
      })
    })

    expect(capturedOuter).toBe('outer')
    expect(capturedInner).toBe('inner')
  })

  test('reactive update: when provider signal changes, useContext signal updates', () => {
    const ctx = createContext<number>(0)
    const countSignal = signal(0)
    let capturedSignal: ReturnType<typeof useContext<number>> | undefined

    withContext(ctx, countSignal, () => {
      capturedSignal = useContext(ctx)
    })

    expect(capturedSignal!.value).toBe(0)
    // Because useContext returns the same signal that was injected,
    // when that signal changes, the captured reference updates too.
    countSignal.value = 42
    expect(capturedSignal!.value).toBe(42)
  })

  test('default value is returned as a signal', () => {
    const ctx = createContext(99)
    const sig = useContext(ctx)
    expect(typeof sig.value).toBe('number')
    expect(sig.value).toBe(99)
  })

  test('withContext treats plain objects with a value property as values, not signals', () => {
    const ctx = createContext<{ value: string }>({ value: 'default' })
    const injected = { value: 'plain-object' }
    let captured: { value: string } | undefined

    withContext(ctx, injected, () => {
      captured = useContext(ctx).value
    })

    expect(captured).toBe(injected)
    expect(captured!.value).toBe('plain-object')
  })
})

describe('createStore', () => {
  test('returns { state, setState } as signals', () => {
    const store = createStore({ count: 0 })
    expect(store.state.value).toEqual({ count: 0 })
    expect(typeof store.setState).toBe('function')
  })

  test('setState with value updates state', () => {
    const store = createStore({ count: 0 })
    store.setState({ count: 5 })
    expect(store.state.value).toEqual({ count: 5 })
  })

  test('setState with updater function updates state', () => {
    const store = createStore({ count: 0 })
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(store.state.value).toEqual({ count: 1 })
  })

  test('provideStore / injectStore share the same instance', () => {
    const store = createStore({ user: 'alice' })
    let injected: typeof store | undefined

    provideStore(store, () => {
      injected = injectStore(store)
    })

    expect(injected).toBe(store)
    expect(injected!.state.value).toEqual({ user: 'alice' })
  })

  test('injectStore without provideStore returns the original store', () => {
    const store = createStore({ count: 0 })
    const result = injectStore(store)
    expect(result).toBe(store)
  })
})
