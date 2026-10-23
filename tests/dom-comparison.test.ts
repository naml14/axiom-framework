import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { createComparison, workload, SETTINGS } from '../benchmarks/dom-comparison.ts'

let win: Window
let comparison: Awaited<ReturnType<typeof createComparison>> | undefined
const saved = new Map<string, PropertyDescriptor | undefined>()
beforeEach(() => {
  win = new Window()
  for (const key of ['window', 'document', 'HTMLElement', 'Text']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: (win as unknown as Record<string, unknown>)[key] ?? win })
  }
})
afterEach(async () => {
  comparison?.dispose()
  comparison = undefined
  await win.happyDOM.close()
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

function cards(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('.card')].map(el => ({
    text: el.textContent, width: el.style.width, height: el.style.height,
    position: el.style.position, transform: el.style.transform,
  }))
}

test('500 cards retain equal content and coordinates through the deterministic workload', async () => {
  const a = document.createElement('div')
  const b = document.createElement('div')
  document.body.append(a, b)
  comparison = await createComparison(a, b, cb => queueMicrotask(cb))
  expect(cards(a)).toEqual(cards(b))
  expect(cards(a)).toHaveLength(500)
  const original = a.querySelector('.card')
  let previousNative = b.querySelector('.card')
  for (const frame of [1, 2, 3, 19, 20]) {
    await comparison.axiom.update(frame)
    await comparison.native.update(frame)
    const actual = cards(a)
    expect(actual).toEqual(cards(b))
    const expected = workload(frame)
    for (let i = 0; i < 500; i++) {
      const card = expected.cards[i]!
      expect(actual[i]).toEqual({ text: String(i), width: '16px', height: '10px',
        position: 'absolute', transform: `translate(${card.x}px,${card.y}px) var(--animation-transform,)` })
    }
    expect(a.querySelector('.card')).toBe(original)
    expect(b.querySelector('.card')).not.toBe(previousNative)
    previousNative = b.querySelector('.card')
  }
  expect(workload(1)).toEqual(workload(1))
  expect(workload(1)).not.toEqual(workload(2))
  expect(SETTINGS.warmups).toBe(5)
  expect(SETTINGS.repetitions).toBe(30)
})

test('updates await scheduled commits and count real root/viewport getter accesses', async () => {
  const a = document.createElement('div')
  const b = document.createElement('div')
  document.body.append(a, b)
  comparison = await createComparison(a, b, cb => queueMicrotask(cb))
  comparison.reads.reset()
  void a.clientWidth
  void window.innerHeight
  expect(comparison.reads.total()).toBe(2)
  comparison.reads.reset()
  const before = cards(a)
  const commit = comparison.axiom.update(2)
  expect(cards(a)).toEqual(before)
  await commit
  expect(cards(a)).not.toEqual(before)
  expect(comparison.reads.total()).toBe(0)
  await comparison.native.update(2)
  expect(comparison.reads.total()).toBe(0)
  comparison.dispose()
  comparison = undefined
  expect(a.children).toHaveLength(0)
  expect(b.children).toHaveLength(0)
  expect(Object.hasOwn(a, 'clientWidth')).toBe(false)
})
