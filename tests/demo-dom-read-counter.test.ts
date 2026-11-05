import { afterEach, expect, test } from 'bun:test'
import { Window as HappyWindow } from 'happy-dom'
import { createApp, defineComponent, signal } from '../src/index.js'
import type { App } from '../src/index.js'
import { initControls } from '../demo/controls.js'
import { installDomReadCounter } from '../demo/dom-read-counter.js'

const windows: HappyWindow[] = []
afterEach(() => { for (const win of windows.splice(0)) win.happyDOM.abort() })

function fixture() {
  const win = new HappyWindow()
  windows.push(win)
  const root = win.document.createElement('div')
  root.id = 'app'
  win.document.body.append(root)
  return { win, root: root as unknown as HTMLElement }
}

test('counts only root dimensions and window viewport reads, preserving values and descriptors', () => {
  const { win, root } = fixture()
  const width = Object.getOwnPropertyDescriptor(win, 'innerWidth')
  const prototypeWidth = Object.getOwnPropertyDescriptor(win.Element.prototype, 'clientWidth')
  const counter = installDomReadCounter(root, win as unknown as Window)
  expect(counter.total()).toBe(0)
  expect(root.clientWidth).toBe(0)
  expect(root.clientHeight).toBe(0)
  expect(win.innerWidth).toBe(1024)
  expect(win.innerHeight).toBe(768)
  expect(counter.total()).toBe(4)
  counter.reset()
  void root.parentElement!.clientWidth
  void win.document.createElement('div').clientHeight
  expect(counter.total()).toBe(0)
  expect(Object.getOwnPropertyDescriptor(win.Element.prototype, 'clientWidth')).toEqual(prototypeWidth)
  counter.dispose()
  expect(Object.getOwnPropertyDescriptor(root, 'clientWidth')).toBeUndefined()
  expect(Object.getOwnPropertyDescriptor(win, 'innerWidth')).toEqual(width)
})

test('controls publish measured reads and cycles/s during slider input, preserving width and item controls', () => {
  const { win, root } = fixture()
  const doc = win.document
  doc.body.insertAdjacentHTML('beforeend', `
    <span id="m-prepare"></span><span id="m-reflow"></span><span id="m-commit"></span>
    <span id="m-total"></span><span id="m-fps">—</span><span id="m-pool"></span>
    <span id="m-dom-reads"></span><input id="width-slider" value="800">
    <span id="width-display"></span><input id="items-slider" value="20">
    <span id="items-display"></span><button id="anim-btn"></button>
    <button id="metrics-btn"></button><footer id="metrics-footer"></footer>
    <button id="other-showcase"></button>`)
  Object.defineProperty(root.parentElement!, 'clientWidth', { configurable: true, value: 1000 })
  const saved = { window: globalThis.window, document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame, getComputedStyle: globalThis.getComputedStyle }
  Object.assign(globalThis, { window: win, document: doc,
    requestAnimationFrame: (cb: FrameRequestCallback) => { cb(0); return 0 },
    getComputedStyle: win.getComputedStyle.bind(win) })
  const counter = installDomReadCounter(root, globalThis.window)
  const containerWidth = signal(800)
  const itemCount = signal(20)
  try {
    initControls({ containerWidth, itemCount, appEl: root, domReads: counter,
      app: { getMetrics: () => ({ prepareMs: 1, reflowMs: 2, commitMs: 3 }) } as unknown as App })
    const slider = doc.getElementById('width-slider') as InstanceType<typeof win.HTMLInputElement>
    slider.value = '640'
    slider.dispatchEvent(new win.Event('input', { bubbles: true }))
    expect(containerWidth.value).toBe(640)
    expect(root.style.width).toBe('640px')
    expect(doc.getElementById('width-display')!.textContent).toBe('640px')
    expect(Number(doc.getElementById('m-fps')!.textContent)).toBeGreaterThan(0)
    expect(doc.getElementById('m-dom-reads')!.textContent).toBe('DOM reads: 0 en el último ciclo')
    const items = doc.getElementById('items-slider') as InstanceType<typeof win.HTMLInputElement>
    items.value = '30'
    items.dispatchEvent(new win.Event('input', { bubbles: true }))
    expect(itemCount.value).toBe(30)
    expect(doc.getElementById('items-display')!.textContent).toBe('30')
    void root.clientWidth
    win.dispatchEvent(new win.Event('resize'))
    doc.getElementById('other-showcase')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    expect(doc.getElementById('m-dom-reads')!.textContent).toBe('DOM reads: 0 en el último ciclo')
  } finally {
    counter.dispose()
    Object.assign(globalThis, saved)
  }
})

test('real app reads on resize, not signal updates, and next interaction resets the cycle', () => {
  const { win, root } = fixture()
  const oldWindow = globalThis.window
  const oldDocument = globalThis.document
  const oldElement = globalThis.HTMLElement
  const oldText = globalThis.Text
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = win.Text as unknown as typeof Text
  globalThis.window = win as unknown as typeof window
  globalThis.document = win.document as unknown as Document
  const counter = installDomReadCounter(root, globalThis.window)
  const value = signal(0)
  const component = defineComponent(() => ({ type: 'element' as const, tag: 'div',
    layout: { width: 100, height: 20 }, children: [{ type: 'text' as const, content: String(value.value) }] }))
  const app = createApp(component, root, { scheduler: cb => cb() })
  try {
    app.mount()
    counter.reset()
    value.value++
    expect(root.textContent).toBe('1')
    expect(counter.total()).toBe(0)
    win.dispatchEvent(new win.Event('resize'))
    expect(counter.total()).toBeGreaterThan(0)
    root.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event)
    value.value++
    expect(counter.total()).toBe(0)
    expect(root.textContent).toBe('2')
    win.dispatchEvent(new win.Event('resize'))
    expect(counter.total()).toBeGreaterThan(0)
    root.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event)
    expect(counter.total()).toBe(0)
  } finally {
    app.unmount()
    counter.dispose()
    globalThis.window = oldWindow
    globalThis.document = oldDocument
    globalThis.HTMLElement = oldElement
    globalThis.Text = oldText
  }
})
