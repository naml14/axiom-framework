import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { createApp, defineComponent, signal } from '../src/index.js'
import { initControls } from '../demo/controls.js'
import { initGridDemo } from '../demo/ruta-b-showcase.js'

let win: Window
let frames: FrameRequestCallback[]
let disposers: Array<() => void>
const globals = ['window', 'document', 'HTMLElement', 'Text', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame'] as const
let originals: Map<string, PropertyDescriptor | undefined>

beforeEach(() => {
  originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  win = new Window()
  frames = []
  disposers = []
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Text: win.Text,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: () => {},
  })
})

afterEach(() => {
  for (const dispose of disposers.reverse()) dispose()
  win.happyDOM.abort()
  for (const key of globals) {
    const descriptor = originals.get(key)
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

function flushFrames(): void {
  const pending = frames.splice(0)
  for (const callback of pending) callback(0)
  expect(frames).toHaveLength(0)
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing fixture: ${id}`)
  return found as T
}

function mountGrid() {
  document.body.innerHTML = `
    <div id="ruta-b-grid-root"></div>
    <button id="ruta-b-grid-add">+Celda</button>
    <button id="ruta-b-grid-remove">−Celda</button>
    <output id="ruta-b-grid-status"></output>`
  const grid = initGridDemo()
  if (!grid) throw new Error('Grid did not mount')
  disposers.push(() => grid.dispose())
  const add = element<HTMLButtonElement>('ruta-b-grid-add')
  const remove = element<HTMLButtonElement>('ruta-b-grid-remove')

  function expectState(count: number): void {
    flushFrames()
    expect(grid!.cellCount.value).toBe(count)
    expect(document.querySelectorAll('#ruta-b-grid-root .grid-cell')).toHaveLength(count)
    expect(element('ruta-b-grid-status').textContent).toBe(
      `${count}/6 celdas | rowSpan: ✓ | colSpan: ${count >= 4 ? '✓' : '—'}`,
    )
    expect(add.disabled).toBe(count === 6)
    expect(remove.disabled).toBe(count === 1)
  }
  return { ...grid, add, remove, expectState }
}

describe('S8: actual demo grid behavior', () => {
  test('reinitialization preserves one grid', () => {
    const first = mountGrid()
    flushFrames()
    const second = initGridDemo()!
    disposers.push(() => second.dispose())
    expect(document.querySelectorAll('.grid-cell')).toHaveLength(6)
    // A stale cleanup must not unmount the replacement or remove its controls.
    first.dispose()
    first.cellCount.value = 1
    first.remove.click()
    flushFrames()
    expect(second.cellCount.value).toBe(5)
    expect(document.querySelectorAll('.grid-cell')).toHaveLength(5)
    second.dispose()
    second.dispose()
    expect(document.querySelectorAll('.grid-cell')).toHaveLength(0)
  })

  test('external count stays bounded', () => {
    const grid = mountGrid()
    grid.cellCount.value = 7
    flushFrames()
    expect(grid.cellCount.value).toBe(6)
    grid.expectState(6)
    grid.cellCount.value = 0
    expect(grid.cellCount.value).toBe(1)
    grid.expectState(1)
  })

  test('clicks preserve exact count, span status and both bounds', () => {
    const grid = mountGrid()
    grid.expectState(6)
    grid.add.click()
    grid.expectState(6)
    for (let count = 5; count >= 1; count--) {
      grid.remove.click()
      grid.expectState(count)
    }
    grid.remove.click()
    grid.expectState(1)
    for (let count = 2; count <= 6; count++) {
      grid.add.click()
      grid.expectState(count)
    }
    grid.add.click()
    grid.expectState(6)
  })

  test('outputs derive from the signal even without a control event (F2 oracle)', () => {
    const grid = mountGrid()
    for (const count of [3, 1, 4, 6]) {
      grid.cellCount.value = count
      grid.expectState(count)
    }
    grid.cellCount.value = 2
    grid.expectState(2)
    grid.add.click()
    grid.expectState(3)
    grid.remove.click()
    grid.expectState(2)
  })
})

function mountControls(hostWidth = 1040) {
  document.body.innerHTML = `
    <section id="host" style="padding: 0 20px"><div id="app"></div></section>
    <input id="width-slider" type="range" min="320" max="1400" step="8" value="800">
    <output id="width-display">800px</output>
    <input id="items-slider" type="range" min="1" max="100" value="20">
    <output id="items-display">20</output>
    <button id="anim-btn"></button><button id="metrics-btn"></button>
    <footer id="metrics-footer"></footer>
    ${['prepare', 'reflow', 'commit', 'total', 'fps', 'pool'].map(name => `<output id="m-${name}"></output>`).join('')}`
  let offeredWidth = hostWidth
  Object.defineProperty(element('host'), 'clientWidth', { get: () => offeredWidth })
  const containerWidth = signal(800)
  const itemCount = signal(20)
  const appEl = element('app')
  appEl.style.width = '800px'
  Object.defineProperty(appEl, 'clientWidth', { get: () => parseFloat(appEl.style.width) })
  const Canvas = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    classes: ['behavior-canvas'],
    layout: { width: containerWidth.value, height: 80 },
  }))
  const app = createApp(Canvas, appEl)
  app.mount()
  disposers.push(() => app.unmount())
  initControls({ containerWidth, itemCount, app, appEl })
  flushFrames()

  function expectWidth(width: number): void {
    flushFrames()
    expect(containerWidth.value).toBe(width)
    expect(element<HTMLInputElement>('width-slider').value).toBe(String(width))
    expect(element('width-display').textContent).toBe(`${width}px`)
    expect(appEl.style.width).toBe(`${width}px`)
    expect((appEl.firstElementChild as HTMLElement).style.width).toBe(`${width}px`)
  }
  return {
    itemCount,
    expectWidth,
    resize(width: number): void {
      offeredWidth = width
      window.dispatchEvent(new win.Event('resize') as unknown as Event)
    },
  }
}

describe('S8: real demo controls with an Axiom canvas', () => {
  test('width slider changes the host and committed canvas geometry', () => {
    const controls = mountControls()
    controls.expectWidth(800)
    const slider = element<HTMLInputElement>('width-slider')
    for (const width of [640, 960]) {
      slider.value = String(width)
      slider.dispatchEvent(new win.Event('input') as unknown as Event)
      controls.expectWidth(width)
    }
    // Preserve the sibling control that shares initControls wiring.
    const items = element<HTMLInputElement>('items-slider')
    items.value = '12'
    items.dispatchEvent(new win.Event('input') as unknown as Event)
    flushFrames()
    expect(controls.itemCount.value).toBe(12)
    expect(element('items-display').textContent).toBe('12')
  })

  test('initial fit and resize respect padding, step rounding and the supported minimum', () => {
    const controls = mountControls(523)
    controls.expectWidth(480)
    for (const [hostWidth, expected] of [[400, 360], [360, 320], [799, 752], [1040, 800]] as const) {
      controls.resize(hostWidth)
      controls.expectWidth(expected)
      const canvas = document.querySelector<HTMLElement>('.behavior-canvas')!
      expect(parseFloat(canvas.style.width)).toBeLessThanOrEqual(hostWidth - 40)
    }
  })
})
