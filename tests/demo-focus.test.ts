import { expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { initSyntaxShowcase } from '../demo/syntax-showcase.js'

test('S5: the actual Clicks button retains node identity and focus through reactive clicks', () => {
  const win = new Window()
  const keys = ['window', 'document', 'HTMLElement', 'Text', 'requestAnimationFrame'] as const
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const frames: FrameRequestCallback[] = []
  Object.assign(globalThis, { window: win, document: win.document,
    HTMLElement: win.HTMLElement, Text: win.Text,
    requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb) })
  try {
    document.body.innerHTML = '<div id="syntax-events-root"></div><pre id="syntax-events-output"></pre>'
    initSyntaxShowcase()
    const button = document.querySelector<HTMLButtonElement>('[data-testid="click-btn"]')!
    expect(button).not.toBeNull()
    button.focus()
    expect(document.activeElement).toBe(button)
    for (let count = 1; count <= 3; count++) {
      button.click()
      for (const frame of frames.splice(0)) frame(0)
      expect(document.querySelector('[data-testid="click-btn"]')).toBe(button)
      expect(document.activeElement).toBe(button)
      expect(button.textContent).toBe(`Clicks: ${count}`)
      expect(document.getElementById('syntax-events-output')!.textContent).toContain(`onClick disparado: ${count}x`)
    }
  } finally {
    win.happyDOM.abort()
    for (const key of keys) {
      const descriptor = saved.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
