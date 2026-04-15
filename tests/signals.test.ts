import { describe, test, expect } from 'bun:test'
import { signal, effect, computed } from '../src/reactivity/signals.js'

describe('signal', () => {
  test('creates a signal with initial value', () => {
    const s = signal(0)
    expect(s.value).toBe(0)
  })

  test('creates a signal with string value', () => {
    const s = signal('hello')
    expect(s.value).toBe('hello')
  })

  test('stores kind metadata', () => {
    const s = signal(0, { kind: 'shape' })
    expect(s.value).toBe(0)
    // kind is internal metadata — we verify it doesn't break creation
  })

  test('setter updates value', () => {
    const s = signal(0)
    s.value = 42
    expect(s.value).toBe(42)
  })

  test('same value set does not notify subscribers', () => {
    const s = signal(5)
    let count = 0
    effect(() => {
      void s.value
      count++
    })
    expect(count).toBe(1) // initial execution
    s.value = 5 // same value
    expect(count).toBe(1) // should NOT re-execute
  })

  test('NaN set does not notify subscribers (Object.is semantics)', () => {
    const s = signal(NaN)
    let count = 0
    effect(() => {
      void s.value
      count++
    })
    expect(count).toBe(1)
    s.value = NaN
    expect(count).toBe(1) // Object.is(NaN, NaN) === true
  })
})

describe('effect', () => {
  test('executes immediately on creation', () => {
    let executed = false
    effect(() => {
      executed = true
    })
    expect(executed).toBe(true)
  })

  test('re-executes when dependency changes', () => {
    const s = signal(0)
    let sum = 0
    effect(() => {
      sum = s.value * 2
    })
    expect(sum).toBe(0)
    s.value = 5
    expect(sum).toBe(10)
  })

  test('tracks multiple dependencies', () => {
    const a = signal(1)
    const b = signal(2)
    let total = 0
    effect(() => {
      total = a.value + b.value
    })
    expect(total).toBe(3)
    a.value = 10
    expect(total).toBe(12)
    b.value = 20
    expect(total).toBe(30)
  })

  test('returns cleanup function', () => {
    const s = signal(0)
    let cleanupCalled = 0
    const dispose = effect(() => {
      void s.value
      return () => {
        cleanupCalled++
      }
    })
    expect(cleanupCalled).toBe(0)
    s.value = 1
    expect(cleanupCalled).toBe(1) // cleanup before re-execute
    dispose()
    expect(cleanupCalled).toBe(2) // cleanup on dispose
  })

  test('nested effects track independently', () => {
    const s = signal(0)
    let outerCount = 0
    let innerCount = 0

    effect(() => {
      outerCount++
      effect(() => {
        void s.value
        innerCount++
      })
    })

    expect(outerCount).toBe(1)
    expect(innerCount).toBe(1)

    s.value = 1
    // outer does NOT re-execute (reads no signals)
    // inner re-executes because s changed
    expect(outerCount).toBe(1)
    expect(innerCount).toBe(2)
  })

  test('protects against infinite loops', () => {
    const s = signal(0)
    let count = 0
    expect(() => {
      effect(() => {
        count++
        if (count <= 200) {
          s.value = s.value + 1
        }
      })
    }).toThrow()
  })
})

describe('computed', () => {
  test('evaluates on first read', () => {
    const s = signal(5)
    const c = computed(() => s.value * 2)
    expect(c.value).toBe(10)
  })

  test('caches result when deps unchanged', () => {
    const s = signal(5)
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return s.value * 2
    })
    void c.value // first read
    void c.value // cached
    void c.value // cached
    expect(evalCount).toBe(1)
  })

  test('invalidates when dependency changes', () => {
    const s = signal(5)
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return s.value * 2
    })
    void c.value
    expect(evalCount).toBe(1)
    s.value = 10
    void c.value
    expect(evalCount).toBe(2)
    expect(c.value).toBe(20)
  })

  test('nested computeds invalidate in chain', () => {
    const s = signal(2)
    const a = computed(() => s.value * 3)
    const b = computed(() => a.value + 1)
    expect(b.value).toBe(7)
    s.value = 5
    expect(b.value).toBe(16) // 5*3+1
  })

  test('computed with no deps caches permanently', () => {
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return 42
    })
    void c.value
    void c.value
    void c.value
    expect(evalCount).toBe(1)
  })
})
