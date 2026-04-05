import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { signal } from '../src/signals.js'
import { bind, validate, required, minLength, maxLength, pattern } from '../src/forms.js'

// Setup happy-dom globals for DOM tests
let happyWindow: Window

beforeAll(() => {
  happyWindow = new Window()
  // Inject DOM globals so our bind() instanceof checks work
  Object.assign(globalThis, {
    document: happyWindow.document,
    HTMLInputElement: happyWindow.HTMLInputElement,
    HTMLTextAreaElement: happyWindow.HTMLTextAreaElement,
    HTMLSelectElement: happyWindow.HTMLSelectElement,
    Event: happyWindow.Event,
    Window: happyWindow.constructor,
    // Required by happy-dom's HTMLSelectElement.value setter (it runs querySelectorAll internally)
    SyntaxError: happyWindow.SyntaxError,
  })
})

// ============================================================
// bind tests
// ============================================================

describe('bind', () => {
  test('binds textarea bidirectionally and disposes correctly', () => {
    const sig = signal('hello textarea')
    const textarea = happyWindow.document.createElement('textarea') as unknown as HTMLTextAreaElement

    const dispose = bind(sig, textarea)

    // initial value from signal
    expect(textarea.value).toBe('hello textarea')

    // DOM -> signal on input
    textarea.value = 'updated from textarea'
    textarea.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('updated from textarea')

    // signal -> DOM
    sig.value = 'updated from signal'
    expect(textarea.value).toBe('updated from signal')

    // dispose stops DOM -> signal updates
    dispose()
    textarea.value = 'changed after dispose'
    textarea.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('updated from signal')
  })

  test('binds select bidirectionally and disposes correctly', () => {
    const sig = signal('b')
    const select = happyWindow.document.createElement('select') as unknown as HTMLSelectElement

    const optionA = happyWindow.document.createElement('option')
    optionA.value = 'a'
    optionA.textContent = 'Option A'

    const optionB = happyWindow.document.createElement('option')
    optionB.value = 'b'
    optionB.textContent = 'Option B'

    const optionC = happyWindow.document.createElement('option')
    optionC.value = 'c'
    optionC.textContent = 'Option C'

    select.append(optionA, optionB, optionC)

    const dispose = bind(sig, select)

    // initial value from signal
    expect(select.value).toBe('b')

    // DOM -> signal on change
    select.value = 'c'
    select.dispatchEvent(new happyWindow.Event('change') as unknown as Event)
    expect(sig.value).toBe('c')

    // signal -> DOM
    sig.value = 'a'
    expect(select.value).toBe('a')

    // dispose stops DOM -> signal updates
    dispose()
    select.value = 'b'
    select.dispatchEvent(new happyWindow.Event('change') as unknown as Event)
    expect(sig.value).toBe('a')
  })

  test('sets initial input value from signal', () => {
    const sig = signal('hello')
    const input = happyWindow.document.createElement('input') as unknown as HTMLInputElement
    bind(sig, input)
    expect(input.value).toBe('hello')
  })

  test('signal change updates DOM input', () => {
    const sig = signal('initial')
    const input = happyWindow.document.createElement('input') as unknown as HTMLInputElement
    bind(sig, input)
    expect(input.value).toBe('initial')
    sig.value = 'updated'
    expect(input.value).toBe('updated')
  })

  test('user input updates signal', () => {
    const sig = signal('')
    const input = happyWindow.document.createElement('input') as unknown as HTMLInputElement
    bind(sig, input)

    // Simulate user typing
    input.value = 'typed'
    input.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('typed')
  })

  test('dispose stops signal→DOM sync', () => {
    const sig = signal('before')
    const input = happyWindow.document.createElement('input') as unknown as HTMLInputElement
    const dispose = bind(sig, input)
    expect(input.value).toBe('before')
    dispose()
    sig.value = 'after'
    // After dispose, DOM should NOT update
    expect(input.value).toBe('before')
  })

  test('dispose stops DOM→signal sync', () => {
    const sig = signal('original')
    const input = happyWindow.document.createElement('input') as unknown as HTMLInputElement
    const dispose = bind(sig, input)
    dispose()

    // After dispose, signal should NOT update from DOM events
    input.value = 'changed'
    input.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('original')
  })

  test('non-input element throws', () => {
    const sig = signal('hello')
    const div = happyWindow.document.createElement('div') as unknown as HTMLInputElement
    expect(() => bind(sig, div)).toThrow()
  })
})

// ============================================================
// validate tests
// ============================================================

describe('validate', () => {
  test('empty rules always returns valid', () => {
    const sig = signal('anything')
    const result = validate(sig, [])
    expect(result.value.valid).toBe(true)
    expect(result.value.errors).toEqual([])
    expect(result.value.pending).toBe(false)
  })

  test('required rule fails on empty string', () => {
    const sig = signal('')
    const result = validate(sig, [required])
    expect(result.value.valid).toBe(false)
    expect(result.value.errors.length).toBeGreaterThan(0)
  })

  test('required rule passes on non-empty string', () => {
    const sig = signal('hello')
    const result = validate(sig, [required])
    expect(result.value.valid).toBe(true)
    expect(result.value.errors).toEqual([])
  })

  test('minLength rule fails when too short', () => {
    const sig = signal('ab')
    const result = validate(sig, [minLength(5)])
    expect(result.value.valid).toBe(false)
    expect(result.value.errors[0]).toContain('5')
  })

  test('minLength rule passes when long enough', () => {
    const sig = signal('hello world')
    const result = validate(sig, [minLength(5)])
    expect(result.value.valid).toBe(true)
  })

  test('maxLength rule fails when too long', () => {
    const sig = signal('this is too long')
    const result = validate(sig, [maxLength(5)])
    expect(result.value.valid).toBe(false)
    expect(result.value.errors[0]).toContain('5')
  })

  test('maxLength rule passes when within limit', () => {
    const sig = signal('hi')
    const result = validate(sig, [maxLength(5)])
    expect(result.value.valid).toBe(true)
  })

  test('pattern rule fails when not matching', () => {
    const sig = signal('abc123')
    const result = validate(sig, [pattern(/^\d+$/, 'Must be digits only')])
    expect(result.value.valid).toBe(false)
    expect(result.value.errors[0]).toBe('Must be digits only')
  })

  test('pattern rule passes when matching', () => {
    const sig = signal('12345')
    const result = validate(sig, [pattern(/^\d+$/)])
    expect(result.value.valid).toBe(true)
  })

  test('fail-fast: stops at first failure', () => {
    const sig = signal('')
    let secondRuleCalled = false
    const secondRule = (value: string) => {
      secondRuleCalled = true
      return value.length > 3 ? null : 'too short'
    }

    validate(sig, [required, secondRule])
    // required fails on '', secondRule should NOT be called
    expect(secondRuleCalled).toBe(false)
  })

  test('async rule resolves validation', async () => {
    const sig = signal('test')
    const asyncRule = async (value: string): Promise<string | null> => {
      return value === 'taken' ? 'Already taken' : null
    }
    const result = validate(sig, [asyncRule], { debounceMs: 0 })

    // Initially pending
    expect(result.value.pending).toBe(true)

    // Wait for async resolution
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(result.value.pending).toBe(false)
    expect(result.value.valid).toBe(true)
  })

  test('async rule fails when value triggers error', async () => {
    const sig = signal('taken')
    const asyncRule = async (value: string): Promise<string | null> => {
      return value === 'taken' ? 'Already taken' : null
    }
    const result = validate(sig, [asyncRule], { debounceMs: 0 })

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(result.value.pending).toBe(false)
    expect(result.value.valid).toBe(false)
    expect(result.value.errors[0]).toBe('Already taken')
  })

  test('async debounce: only latest wins', async () => {
    const sig = signal('a')
    let asyncCallCount = 0
    const asyncRule = async (_value: string): Promise<string | null> => {
      asyncCallCount++
      await new Promise(resolve => setTimeout(resolve, 20))
      return null
    }
    const result = validate(sig, [asyncRule], { debounceMs: 50 })

    // Rapid changes — each should cancel the previous debounce
    sig.value = 'ab'
    sig.value = 'abc'
    sig.value = 'abcd'

    // Wait long enough for one async call to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    // Due to debounce, only one (or at most a few) async calls should have been made
    // The key: the LAST value should be what's validated
    expect(result.value.pending).toBe(false)
    // asyncCallCount should be small (debounce worked)
    expect(asyncCallCount).toBeLessThanOrEqual(2)
  })

  test('async debounce: result corresponds to LAST value (not a stale earlier one)', async () => {
    const sig = signal('valid')
    // Rule: 'invalid' → error, anything else → null
    const asyncRule = async (value: string): Promise<string | null> => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 10))
      return value === 'invalid' ? 'Value is invalid' : null
    }
    const result = validate(sig, [asyncRule], { debounceMs: 0 })

    // Wait for first validation to settle
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(result.value.valid).toBe(true)

    // Change to invalid — then immediately change BACK to valid
    // The stale 'invalid' result must NOT overwrite the final 'valid' result
    sig.value = 'invalid'
    sig.value = 'valid'

    // Wait for final validation to settle
    await new Promise(resolve => setTimeout(resolve, 100))

    // Final state MUST reflect the last value ('valid'), not the intermediate ('invalid')
    expect(result.value.pending).toBe(false)
    expect(result.value.valid).toBe(true)
    expect(result.value.errors).toEqual([])
  })

  test('validate dispose: cleans up effect and pending timer', async () => {
    const sig = signal('test')
    const asyncRule = async (_value: string): Promise<string | null> => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return null
    }
    const result = validate(sig, [asyncRule], { debounceMs: 0 })

    // Dispose immediately before async resolves
    result.dispose()

    // Change the signal — should NOT trigger any re-evaluation
    const validBefore = result.value.valid
    sig.value = 'changed'

    await new Promise(resolve => setTimeout(resolve, 100))

    // After dispose, the result should not have changed from the moment of dispose
    expect(result.value.valid).toBe(validBefore)
  })

  test('validate result is reactive to signal changes', () => {
    const sig = signal('')
    const result = validate(sig, [required])
    expect(result.value.valid).toBe(false)

    sig.value = 'hello'
    expect(result.value.valid).toBe(true)
  })

  test('sync rule failure prevents async rule from running', async () => {
    // When a sync rule fails, the async rule should NEVER be called
    // and pending should remain false (no debounce started).
    const sig = signal('')
    let asyncRuleCalled = false
    const asyncRule = async (_value: string): Promise<string | null> => {
      asyncRuleCalled = true
      return null
    }

    const result = validate(sig, [required, asyncRule], { debounceMs: 0 })

    // required fails on '' — async rule must NOT be called, pending must stay false
    expect(result.value.valid).toBe(false)
    expect(result.value.pending).toBe(false)

    // Wait a tick to make sure no async timer fired
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(asyncRuleCalled).toBe(false)
    result.dispose()
  })
})

// ============================================================
// bind — textarea and select element tests
// ============================================================

describe('bind — textarea and select', () => {
  test('bind works with textarea: signal→DOM', () => {
    const sig = signal('initial text')
    const textarea = happyWindow.document.createElement(
      'textarea'
    ) as unknown as HTMLTextAreaElement
    bind(sig, textarea)
    expect(textarea.value).toBe('initial text')
    sig.value = 'updated text'
    expect(textarea.value).toBe('updated text')
  })

  test('bind works with textarea: DOM→signal', () => {
    const sig = signal('')
    const textarea = happyWindow.document.createElement(
      'textarea'
    ) as unknown as HTMLTextAreaElement
    bind(sig, textarea)
    textarea.value = 'user typed'
    textarea.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('user typed')
  })

  // Note: HTMLSelectElement tests are skipped because happy-dom v20.8.9 throws when
  // setting `select.value` on an element created outside a fully-mounted happy-dom Page.
  // The effect() inside bind() sets `el.value = sig.value` immediately, which triggers
  // HTMLSelectElement's internal querySelectorAll — and that crashes with
  // "undefined is not a constructor (evaluating 'new this.window.SyntaxError(...)')" because
  // `this.window` is not fully initialized for standalone-created elements.
  // The bind() implementation correctly accepts HTMLSelectElement (type guard + BindableElement union).
  // Integration coverage for select can be added once we upgrade happy-dom or use a Page context.
  test.skip('bind works with select: signal→DOM (skipped: happy-dom select.value limitation)', () => {
    const sig = signal('option2')
    const select = happyWindow.document.createElement('select') as unknown as HTMLSelectElement
    bind(sig, select)
    expect(select.value).toBe('option2')
  })

  test.skip('bind works with select: DOM→signal (skipped: happy-dom select.value limitation)', () => {
    const sig = signal('')
    const select = happyWindow.document.createElement('select') as unknown as HTMLSelectElement
    bind(sig, select)
    select.dispatchEvent(new happyWindow.Event('input') as unknown as Event)
    expect(sig.value).toBe('')
  })
})
