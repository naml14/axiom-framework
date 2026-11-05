import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { Window } from 'happy-dom'
import { readFile } from 'node:fs/promises'
import { clearPlugins, createStore, effect, injectStore, provideStore, signal } from '../src/index.js'
import { initRouterDemo } from '../demo/router-demo.js'
import { initRutaBShowcase } from '../demo/ruta-b-showcase.js'
import { initSyntaxShowcase } from '../demo/syntax-showcase.js'

const demoSource = (file: string) => readFile(new URL(`../demo/${file}`, import.meta.url), 'utf8')

test('S5: readouts use the core effect without a duplicate demo helper', async () => {
  for (const file of ['dx-showcase.ts', 'router-demo.ts', 'ruta-b-showcase.ts', 'syntax-jsx-feature.tsx', 'syntax-showcase.ts']) {
    const source = await demoSource(file)
    expect(source).not.toContain('wireShowcase')
    expect(source).not.toContain('wire-showcase.ts')
    expect(source).toContain('effect(')
  }
  const helper = await demoSource('wire-showcase.ts').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  expect(helper.trim()).toBe('')
})

test('S5: context provider returns the core provider result without capture state', async () => {
  const source = await demoSource('context-demo.ts')
  expect(source).toContain('return provideStore(counterStore, () => props.children() as ComponentNode)')
  expect(source).not.toContain('let node!')
  expect(source).not.toContain('retorna void')
})

test('S5: router delegates outlet selection and maps user props in the route table', async () => {
  const source = await demoSource('router-demo.ts')
  expect(source).toContain('createRouteOutlet(router.$route, routes, NotFound)')
  expect(source).toContain("props: route => ({ userId: route.params['id'] ?? '' })")
  expect(source).not.toContain('._fn(')
})

test('S5: animation delegates cancellation of both transitions to core', async () => {
  const source = await demoSource('ruta-b-showcase.ts')
  expect(source).toContain('cancelTransition(animState)')
  expect(source).toContain('cancelTransition(bgAnimState)')
  expect(source).not.toContain('activeTransition = null')
})

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

test('store provider returns children while sharing the provided store and restoring scope', () => {
  const store = createStore({ count: 0 })
  const output = provideStore(store, () => {
    const first = injectStore(store)
    const second = injectStore(store)
    first.setState({ count: 1 })
    expect(second.state.value.count).toBe(1)
    return 'counter subtree'
  })
  expect(output).toBe('counter subtree')
  expect(store.state.value.count).toBe(1)
})

test('router demo preserves user props, static pages, wildcard fallback and inspector disposal', () => {
  document.body.innerHTML = `<div id="router-demo-root"></div><output id="router-output"></output>${
    ['home', 'about', 'users', 'user-1', 'user-2', 'user-3', 'async', '404', 'back', 'forward', 'replace']
      .map(name => `<button id="router-nav-${name}"></button>`).join('')}`
  initRouterDemo()
  const cleanup = (window as { __ROUTER_DEMO_CLEANUP__?: () => void }).__ROUTER_DEMO_CLEANUP__!
  cleanups.push(cleanup)
  const root = document.getElementById('router-demo-root')!
  const inspector = document.getElementById('router-output')!
  const flush = () => { for (const frame of frames.splice(0)) frame(0) }
  click('router-nav-home')
  flush()
  expect(root.textContent).toContain('Bienvenido al Router Demo')
  for (const [id, name] of [['1', 'Ada Lovelace'], ['2', 'Alan Turing'], ['3', 'Grace Hopper']]) {
    click(`router-nav-user-${id}`)
    flush()
    expect(root.textContent).toContain(name!)
    expect(root.textContent).toContain(`ID param: "${id}"`)
    expect(JSON.parse(inspector.textContent!)).toEqual({
      path: `/users/${id}`, params: { id }, query: {}, hash: '',
      matched: { name: 'user-detail', path: '/users/:id' },
    })
  }
  click('router-nav-users')
  flush()
  expect(root.textContent).toContain('Lista de usuarios')
  click('router-nav-replace')
  flush()
  expect(root.textContent).toContain('Acerca de Axiom Router')
  click('router-nav-404')
  flush()
  expect(root.textContent).toContain('Página no encontrada')
  expect(root.textContent).toContain('La ruta solicitada no coincide con ninguna ruta registrada.')
  const before = inspector.textContent
  cleanup()
  click('router-nav-home')
  expect(inspector.textContent).toBe(before)
  expect(root.childNodes).toHaveLength(0)
})

test('computed readouts track real signals immediately, including dependency changes and disposal', () => {
  const first = signal(2)
  const second = signal(10)
  const chooseFirst = signal(true)
  const output = document.createElement('output')
  const button = document.createElement('button')
  let runs = 0
  const stop = effect(() => {
    runs++
    const count = chooseFirst.value ? first.value : second.value
    output.textContent = `${count} items`
    button.disabled = count >= 6
  })
  cleanups.push(stop)
  expect(output.textContent).toBe('2 items')
  expect(button.disabled).toBe(false)
  first.value = 6
  expect(output.textContent).toBe('6 items')
  expect(button.disabled).toBe(true)
  chooseFirst.value = false
  expect(output.textContent).toBe('10 items')
  expect(button.disabled).toBe(true)
  const before = runs
  first.value = 1
  expect(runs).toBe(before)
  second.value = 3
  expect(output.textContent).toBe('3 items')
  expect(button.disabled).toBe(false)
  stop()
  stop()
  second.value = 20
  expect(output.textContent).toBe('3 items')
  expect(button.disabled).toBe(false)
  expect(runs).toBe(before + 1)
})

test('responsive inspector follows width without polling and stops on disposal', () => {
  document.body.innerHTML = '<output id="ruta-b-responsive-info"></output><div id="ruta-b-responsive-bar"></div>'
  const width = signal(480)
  const stop = initRutaBShowcase({ containerWidth: width })
  if (stop) cleanups.push(stop)
  const output = document.getElementById('ruta-b-responsive-info')!
  const bar = document.getElementById('ruta-b-responsive-bar')!
  expect(output.textContent).toBe('480px → breakpoint: sm | 100% = 480px')
  expect(bar.style.width).toBe(`${(480 / 1400) * 100}%`)
  width.value = 1024
  expect(output.textContent).toBe('1024px → breakpoint: lg | 100% = 1024px')
  expect(bar.style.width).toBe(`${(1024 / 1400) * 100}%`)
  // The responsive bar takes the color the legend assigns to the active
  // breakpoint; `lg` is the indigo step of the logo palette.
  expect(bar.style.background).toBe('var(--accent-indigo)')
  expect(frames).toHaveLength(0)
  stop?.()
  width.value = 320
  expect(output.textContent).toBe('1024px → breakpoint: lg | 100% = 1024px')
})

test('event inspector observes the updated hover signal, not the capture-phase stale value', () => {
  document.body.innerHTML = '<div id="syntax-events-root"></div><output id="syntax-events-output"></output>'
  const stop = initSyntaxShowcase()
  if (stop) cleanups.push(stop)
  const output = document.getElementById('syntax-events-output')!
  const expected = (clicks: number, hovers: number) =>
    `onClick disparado: ${clicks}x  |  onMouseEnter: ${hovers}x\naria: { label: "Botón de click" }  data: { testid: "click-btn" }`
  expect(output.textContent).toBe(expected(0, 0))
  document.querySelector('.syntax-demo-item')!.dispatchEvent(new win.MouseEvent('mouseenter') as unknown as Event)
  expect(output.textContent).toBe(expected(0, 1))
  document.querySelector('button')!.click()
  expect(output.textContent).toBe(expected(1, 1))
})

function click(id: string): void {
  const button = document.getElementById(id)
  if (!button) throw new Error(`Missing control: ${id}`)
  button.click()
}

function text(id: string): string | null {
  return document.getElementById(id)!.textContent
}

test('layout and flow controls preserve their text, classes and rendered trees', () => {
  document.body.innerHTML = `
    <div id="syntax-layout-root"></div><output id="syntax-layout-output"></output>
    <button id="syntax-layout-stack-btn"></button><button id="syntax-layout-row-btn"></button><button id="syntax-layout-grid-btn"></button>
    <div id="syntax-flow-root"></div><output id="syntax-flow-output"></output>
    <button id="syntax-flow-toggle-btn"></button><button id="syntax-flow-add-btn"></button><button id="syntax-flow-switch-btn"></button>`
  cleanups.push(initSyntaxShowcase())
  for (const mode of ['stack', 'row', 'grid', 'stack']) {
    click(`syntax-layout-${mode}-btn`)
    expect(text('syntax-layout-output')).toBe(`mode: ${mode} — 4 items`)
    expect(document.querySelectorAll('#syntax-layout-root .syntax-demo-item')).toHaveLength(4)
    for (const other of ['stack', 'row', 'grid']) {
      expect(document.getElementById(`syntax-layout-${other}-btn`)!.classList.contains('active')).toBe(other === mode)
    }
  }
  expect(text('syntax-flow-output')).toBe('Show.when=true  For.length=2  Switch=alpha')
  click('syntax-flow-toggle-btn')
  expect(text('syntax-flow-output')).toBe('Show.when=false  For.length=2  Switch=alpha')
  expect(text('syntax-flow-toggle-btn')).toBe('Show: oculto')
  expect(document.getElementById('syntax-flow-toggle-btn')!.classList.contains('active')).toBe(false)
  click('syntax-flow-add-btn')
  expect(text('syntax-flow-output')).toBe('Show.when=false  For.length=3  Switch=alpha')
  for (const step of ['beta', 'gamma', 'alpha']) {
    click('syntax-flow-switch-btn')
    expect(text('syntax-flow-output')).toBe(`Show.when=false  For.length=3  Switch=${step}`)
  }
  click('syntax-flow-toggle-btn')
  expect(text('syntax-flow-toggle-btn')).toBe('Show: visible')
  expect(document.getElementById('syntax-flow-toggle-btn')!.classList.contains('active')).toBe(true)
  // Flush only renderer work; readouts above never need a frame.
  for (const callback of frames.splice(0)) callback(0)
  expect(document.getElementById('syntax-flow-root')!.textContent).toContain('Ítem 3')
})

test('runtime bridges preserve animation, style, plugin log and error probe output', () => {
  document.body.innerHTML = `
    <output id="ruta-b-anim-status"></output><div id="ruta-b-anim-progress"></div>
    <button id="ruta-b-anim-run"></button><button id="ruta-b-anim-cancel"></button>
    <pre id="ruta-b-style-output"></pre><span id="ruta-b-style-sample">Elemento de muestra</span>
    <button id="ruta-b-style-apply"></button><button id="ruta-b-style-reset"></button>
    <pre id="ruta-b-plugin-log"></pre><button id="ruta-b-plugin-clear"></button>
    <button id="ruta-b-plugin-mount"></button><button id="ruta-b-plugin-unmount"></button>
    <pre id="ruta-b-error-output"></pre><button id="ruta-b-error-run"></button>`
  cleanups.push(initRutaBShowcase({ containerWidth: signal(800) }))
  expect(text('ruta-b-anim-status')).toBe('opacity: 800ms ease-in-out | backgroundColor: 600ms delay:100ms')
  click('ruta-b-anim-run')
  expect(text('ruta-b-anim-status')).toBe('Transición activa — duration: 800ms, easing: ease-in-out')
  click('ruta-b-anim-cancel')
  expect(text('ruta-b-anim-status')).toBe('Transición cancelada')
  expect(document.getElementById('ruta-b-anim-progress')!.style.width).toBe('0%')
  const style = JSON.parse(text('ruta-b-style-output')!)
  expect(style.validation).toEqual({ valid: true })
  expect(style.resolved.backgroundColor).toBe('#7c3aed')
  click('ruta-b-style-apply')
  expect(text('ruta-b-style-sample')).toBe('✓ applyStyleToElement aplicado')
  expect(document.getElementById('ruta-b-style-sample')!.style.borderRadius).toBe('14px')
  click('ruta-b-style-reset')
  expect(text('ruta-b-style-sample')).toBe('Elemento de muestra')
  expect(document.getElementById('ruta-b-style-sample')!.getAttribute('style')).toBeNull()
  expect(text('ruta-b-plugin-log')).toContain('2 plugins registrados: demo-logger, demo-metrics')
  click('ruta-b-plugin-mount')
  expect(text('ruta-b-plugin-log')).toContain('onMount — appId: demo-ruta-b')
  click('ruta-b-plugin-unmount')
  expect(text('ruta-b-plugin-log')).toContain('onUnmount — appId: demo-ruta-b')
  click('ruta-b-plugin-clear')
  expect(text('ruta-b-plugin-log')).toBe('Log limpiado.')
  click('ruta-b-error-run')
  expect(JSON.parse(text('ruta-b-error-output')!).error).toBe('v0.2.8 envelope: forced error in component render')
})

test('benchmark bridges its measured result, bar and budget class and cancels pending work', async () => {
  document.body.innerHTML = `<button id="syntax-bench-run-btn"></button>
    <div id="syntax-bench-bar" style="width: 20%"></div><pre id="syntax-bench-output">Sin ejecutar</pre>`
  const stop = initSyntaxShowcase()
  cleanups.push(stop)
  const bar = document.getElementById('syntax-bench-bar')!
  expect(text('syntax-bench-output')).toBe('Sin ejecutar')
  expect(bar.style.width).toBe('20%')
  const clock = spyOn(performance, 'now')
  try {
    for (const { ratio, delta, warning, width } of [
      { ratio: 1.04, delta: '+4.0', warning: false, width: 62.4 },
      { ratio: 1.05, delta: '+5.0', warning: false, width: 63 },
      { ratio: 1.06, delta: '+6.0', warning: true, width: 63.6 },
    ]) {
      const duration = 2.228 * (500 / 5000) * ratio
      let calls = 0
      clock.mockImplementation(() => calls++ * duration)
      click('syntax-bench-run-btn')
      expect(text('syntax-bench-output')).toBe('⏳ Ejecutando…')
      expect(bar.style.width).toBe('0%')
      expect(bar.classList.contains('over-budget')).toBe(false)
      await new Promise(resolve => setTimeout(resolve, 40))
      expect(text('syntax-bench-output')).toBe(
        `prepare()  ${duration.toFixed(3)}ms  (500 nodos con h() + stack + For)\n` +
        `Golden escalado (500/5000): 0.223ms   Delta: ${delta}%\n` +
        (warning ? '⚠️  Por encima del presupuesto — revisar regresión' : '✅ Dentro del presupuesto (≤ +5% golden)'),
      )
      expect(bar.classList.contains('over-budget')).toBe(warning)
      expect(parseFloat(bar.style.width)).toBeCloseTo(width, 10)
    }
  } finally {
    clock.mockRestore()
  }
  click('syntax-bench-run-btn')
  click('syntax-bench-run-btn')
  stop()
  await new Promise(resolve => setTimeout(resolve, 40))
  expect(text('syntax-bench-output')).toBe('⏳ Ejecutando…')
  expect(bar.style.width).toBe('0%')
})
