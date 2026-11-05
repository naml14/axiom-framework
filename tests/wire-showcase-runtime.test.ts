import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { clearPlugins, createApp, defineComponent, signal } from '../src/index.ts'
import { initJsxFeature } from '../demo/syntax-jsx-feature.tsx'
import { initDxShowcase } from '../demo/dx-showcase.ts'
import { initRouterDemo } from '../demo/router-demo.ts'

let win: Window
let frames: FrameRequestCallback[]
let cleanups: Array<() => void>
const keys = ['window', 'document', 'HTMLElement', 'Text', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame'] as const
let originals: Map<string, PropertyDescriptor | undefined>

beforeEach(() => {
  originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  win = new Window()
  frames = []
  cleanups = []
  Object.assign(globalThis, {
    window: win, document: win.document, HTMLElement: win.HTMLElement, Text: win.Text,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: () => {},
  })
})

afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup()
  clearPlugins()
  win.happyDOM.abort()
  for (const key of keys) {
    const descriptor = originals.get(key)
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

function click(id: string): void {
  const button = document.getElementById(id)
  if (!button) throw new Error(`Missing control: ${id}`)
  button.click()
}

function text(id: string): string | null {
  return document.getElementById(id)!.textContent
}

test('JSX readout derives visibility, list size and selected badge', () => {
  document.body.innerHTML = `<div id="syntax-jsx-root"></div><output id="syntax-jsx-output"></output>
    <button id="syntax-jsx-toggle-btn"></button><button id="syntax-jsx-add-btn"></button>`
  const stop = initJsxFeature()
  if (stop) cleanups.push(stop)
  expect(text('syntax-jsx-output')).toBe('visible=true  items=3  active=UI')
  const badge = [...document.querySelectorAll('#syntax-jsx-root .syntax-demo-item')].find(node => node.textContent === 'SSR')!
  badge.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event)
  expect(text('syntax-jsx-output')).toBe('visible=true  items=3  active=SSR')
  click('syntax-jsx-add-btn')
  expect(text('syntax-jsx-output')).toBe('visible=true  items=4  active=SSR')
  click('syntax-jsx-toggle-btn')
  expect(text('syntax-jsx-output')).toBe('visible=false  items=4  active=SSR')
  expect(text('syntax-jsx-toggle-btn')).toBe('Show: oculto')
  expect(document.getElementById('syntax-jsx-toggle-btn')!.classList.contains('active')).toBe(false)
})

test('DX bridges real profiling callbacks and explicit snapshots without polling', () => {
  document.body.innerHTML = `<div id="dx-app"></div>
    <button id="dx-profiling-btn">📈 Profiling: ON</button><button id="dx-hotreload-btn">♻️ Hot Reload</button>
    <button id="dx-devhook-refresh"></button><button id="dx-error-test"></button>
    <pre id="dx-profile-order"></pre><pre id="dx-devhook-output"></pre><pre id="dx-error-output"></pre>`
  const count = signal(0)
  const app = createApp(defineComponent(() => ({ type: 'element' as const, tag: 'div', children: [{ type: 'text' as const, content: String(count.value) }] })), document.getElementById('dx-app')!)
  app.mount()
  cleanups.push(() => app.unmount())
  cleanups.push(initDxShowcase({ app }))
  expect(text('dx-hotreload-btn')).toBe('♻️ Hot Reload')
  expect(text('dx-devhook-output')).toBe('window.__AXIOM__ no disponible (modo no-dev o app no montada).')
  count.value++
  for (const callback of frames.splice(0)) callback(0)
  expect(text('dx-profile-order')).toMatch(/^cycle #\d+: prepare → reflow → commit → total \| total observado=\d+\.\d{2}ms$/)
  click('dx-profiling-btn')
  expect(text('dx-profile-order')).toBe('Profiling detenido.')
  expect(text('dx-profiling-btn')).toBe('📈 Profiling: OFF')
  click('dx-hotreload-btn')
  expect(text('dx-hotreload-btn')).toBe('♻️ Hot Reload Recovery: ON')
  click('dx-hotreload-btn')
  expect(text('dx-hotreload-btn')).toBe('♻️ Hot Reload Recovery: OFF')
  click('dx-error-test')
  expect(JSON.parse(text('dx-error-output')!).error).toBe('DX probe: forced render error')
})

test('router inspector reacts immediately to push and replace and stops at cleanup', () => {
  win.happyDOM.setURL('http://localhost/')
  const names = ['home', 'about', 'users', 'user-1', 'user-2', 'user-3', 'async', '404', 'back', 'forward', 'replace']
  document.body.innerHTML = `<div id="router-demo-root"></div><pre id="router-output"></pre>` +
    names.map(name => `<button id="router-nav-${name}"></button>`).join('')
  initRouterDemo()
  const cleanup = (window as unknown as { __ROUTER_DEMO_CLEANUP__: () => void }).__ROUTER_DEMO_CLEANUP__
  cleanups.push(cleanup)
  expect(JSON.parse(text('router-output')!).path).toBe('/')
  // Mount may schedule one renderer update; an inspector poll would reschedule itself.
  for (const callback of frames.splice(0)) callback(0)
  expect(frames).toHaveLength(0)
  click('router-nav-user-2')
  expect(JSON.parse(text('router-output')!)).toEqual({ path: '/users/2', params: { id: '2' }, query: {}, hash: '', matched: { name: 'user-detail', path: '/users/:id' } })
  click('router-nav-replace')
  expect(JSON.parse(text('router-output')!).path).toBe('/about')
  cleanup()
  const snapshot = text('router-output')
  click('router-nav-home')
  expect(text('router-output')).toBe(snapshot)
})
