import {
  signal,
  defineComponent,
  createApp,
  prepare,
  h,
  t,
  stack,
  row,
  grid,
  For,
  Show,
  Switch,
  Match,
} from '../src/index.ts'
import { wireShowcase } from './wire-showcase.ts'
// ============================================================
// ============================================================
// Syntax v2 Showcase — 5 features interactivas
// Patrón: HTML estático con ids → initXxxShowcase(deps) → app.ts
// ============================================================

export function initSyntaxShowcase(): () => void {
  const stops = [initHComparison(), initLayoutDSL(), initFlowControl(), initEventsAttrs(), initBenchmark()]
  return () => { for (const stop of stops) stop?.() }
}

// ============================================================
// Feature 1 — h() vs API Literal
// ============================================================

function initHComparison() {
  const literalRoot = document.getElementById('syntax-h-literal-root')
  const v2Root      = document.getElementById('syntax-h-v2-root')
  const output      = document.getElementById('syntax-h-output')
  if (!literalRoot || !v2Root || !output) return

  // ---- Before: plain object literal API ----
  // El wrapper con `padding: 10` declara en el layout del motor el inset que
  // antes daba el CSS del host (`.syntax-panel > div:last-child`), siguiendo la
  // regla de demo-ui-polish.md: el host de un árbol Axiom no lleva padding CSS.
  const LiteralCard = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    classes: [],
    layout: { flexDirection: 'column' as const, padding: 10 },
    children: [
      {
        type: 'element' as const,
        tag: 'div',
        classes: ['syntax-demo-item'],
        layout: { flexDirection: 'column' as const, gap: 4, padding: 8 },
        children: [
          {
            type: 'element' as const,
            tag: 'div',
            classes: [],
            layout: {},
            children: [{ type: 'text' as const, content: 'Literal API' }],
          },
          {
            type: 'element' as const,
            tag: 'div',
            classes: [],
            layout: {},
            children: [{ type: 'text' as const, content: 'Same tree. More boilerplate.' }],
          },
        ],
      },
    ],
  }))

  // ---- After: h() shorthand (Syntax v2) ----
  const V2Card = defineComponent(() =>
    h('div', { flex: 'column', padding: 10 },
      h('div', { class: 'syntax-demo-item', flex: 'column', gap: 4, padding: 8 },
        h('div', {}, t('h() shorthand')),
        h('div', {}, t('Same tree. Less noise.')),
      )
    )
  )

  const literalApp = createApp(LiteralCard, literalRoot)
  const v2App      = createApp(V2Card, v2Root)
  literalApp.mount()
  v2App.mount()

  output.textContent = '✅ Both trees mounted — h() compiles to the same ComponentNode as the literal API.'
  return () => { literalApp.unmount(); v2App.unmount() }
}

// ============================================================
// Feature 2 — Layout DSL: stack / row / grid
// ============================================================

type LayoutMode = 'stack' | 'row' | 'grid'

function initLayoutDSL() {
  const container   = document.getElementById('syntax-layout-root')
  const outputEl    = document.getElementById('syntax-layout-output')
  const stackBtn    = document.getElementById('syntax-layout-stack-btn')
  const rowBtn      = document.getElementById('syntax-layout-row-btn')
  const gridBtn     = document.getElementById('syntax-layout-grid-btn')
  if (!container || !outputEl || !stackBtn || !rowBtn || !gridBtn) return

  const mode = signal<LayoutMode>('stack')

  const ITEMS = ['Alfa', 'Beta', 'Gamma', 'Delta']

  const LayoutDemo = defineComponent(() => {
    const current = mode.value

    if (current === 'stack') {
      return stack({ gap: 6, padding: 8 },
        ...ITEMS.map((label) => h('div', { class: 'syntax-demo-item', padding: 6 }, t(label)))
      )
    }
    if (current === 'row') {
      return row({ gap: 6, padding: 8 },
        ...ITEMS.map((label) => h('div', { class: 'syntax-demo-item', padding: 6, width: 54 }, t(label)))
      )
    }
    // grid
    return grid(2, { gap: 6, padding: 8 },
      ...ITEMS.map((label) => h('div', { class: 'syntax-demo-item', padding: 6 }, t(label)))
    )
  })

  const output = outputEl as HTMLElement
  const stackButton = stackBtn as HTMLElement
  const rowButton = rowBtn as HTMLElement
  const gridButton = gridBtn as HTMLElement

  const app = createApp(LayoutDemo, container)
  app.mount()

  const stop = wireShowcase(() => {
    const current = mode.value
    for (const [button, value] of [[stackButton, 'stack'], [rowButton, 'row'], [gridButton, 'grid']] as const) {
      button.classList.toggle('active', current === value)
    }
    output.textContent = `mode: ${current} — ${ITEMS.length} items`
  })

  stackButton.addEventListener('click', () => { mode.value = 'stack' })
  rowButton.addEventListener('click', () => { mode.value = 'row' })
  gridButton.addEventListener('click', () => { mode.value = 'grid' })
  return () => { stop(); app.unmount() }
}

// ============================================================
// Feature 3 — Control de flujo: Show / For / Switch
// ============================================================

function initFlowControl() {
  const container   = document.getElementById('syntax-flow-root')
  const outputEl    = document.getElementById('syntax-flow-output')
  const toggleBtn   = document.getElementById('syntax-flow-toggle-btn')
  const addBtn      = document.getElementById('syntax-flow-add-btn')
  const switchBtn   = document.getElementById('syntax-flow-switch-btn')
  if (!container || !outputEl || !toggleBtn || !addBtn || !switchBtn) return

  const visible    = signal(true)
  const items      = signal<string[]>(['Ítem 1', 'Ítem 2'])
  const switchStep = signal(0)
  const SWITCH_LABELS = ['alpha', 'beta', 'gamma'] as const

  const FlowDemo = defineComponent(() => {
    const showNode = Show({
      when: visible.value,
      children: h('div', { class: 'syntax-demo-item', padding: 6 }, t('👁 Visible ahora')),
      fallback: h('div', { class: 'syntax-demo-item', padding: 6 }, t('🙈 Oculto')),
    })

    const forItems = For({
      each: items.value,
      keyBy: (item) => item,
      children: (item) =>
        h('div', { class: 'syntax-demo-item', padding: 4 }, t(`• ${item}`)),
    })

    const step = SWITCH_LABELS[switchStep.value % SWITCH_LABELS.length]!
    const switchNode = Switch({
      children: [
        Match({ when: step === 'alpha', children: h('div', { class: 'syntax-demo-item syntax-demo-item--switch', padding: 15 }, t('⇄ Switch: alpha')) }),
        Match({ when: step === 'beta',  children: h('div', { class: 'syntax-demo-item syntax-demo-item--switch', padding: 15 }, t('⇄ Switch: beta')) }),
        Match({ when: step === 'gamma', children: h('div', { class: 'syntax-demo-item syntax-demo-item--switch', padding: 15 }, t('⇄ Switch: gamma')) }),
      ],
    })

    return stack({ gap: 6, padding: 8 },
      h('div', { class: 'syntax-flow-label' }, t('Show')),
      showNode,
      h('div', { class: 'syntax-flow-label' }, t('For')),
      forItems,
      h('div', { class: 'syntax-flow-label' }, t('Switch')),
      switchNode,
    )
  })

  const app = createApp(FlowDemo, container)
  app.mount()

  toggleBtn.addEventListener('click', () => {
    visible.value = !visible.value
  })

  addBtn.addEventListener('click', () => {
    items.value = [...items.value, `Ítem ${items.value.length + 1}`]
  })

  switchBtn.addEventListener('click', () => {
    switchStep.value = switchStep.value + 1
  })

  const stop = wireShowcase(() => {
    toggleBtn.textContent = `Show: ${visible.value ? 'visible' : 'oculto'}`
    toggleBtn.classList.toggle('active', visible.value)
    outputEl.textContent = `Show.when=${visible.value}  For.length=${items.value.length}  Switch=${SWITCH_LABELS[switchStep.value % SWITCH_LABELS.length]}`
  })
  return () => { stop(); app.unmount() }
}

// ============================================================
// Feature 4 — Eventos + Attrs inspector
// ============================================================

function initEventsAttrs() {
  const container = document.getElementById('syntax-events-root')
  const outputEl  = document.getElementById('syntax-events-output')
  if (!container || !outputEl) return

  const clickCount = signal(0)
  const hoverCount = signal(0)

  const EventsDemo = defineComponent(() =>
    stack({ gap: 8, padding: 8 },
      h('button', {
        class: 'syntax-demo-btn',
        aria: { label: 'Botón de click' },
        data: { testid: 'click-btn' },
        onClick: () => { clickCount.value = clickCount.value + 1 },
      }, t(`Clicks: ${clickCount.value}`)),
      h('div', {
        class: 'syntax-demo-item',
        padding: 6,
        onMouseEnter: () => { hoverCount.value = hoverCount.value + 1 },
      }, t(`Hover entries: ${hoverCount.value}`)),
    )
  )

  const app = createApp(EventsDemo, container)
  app.mount()

  const output = outputEl as HTMLElement

  const stop = wireShowcase(() => {
    output.textContent = `onClick disparado: ${clickCount.value}x  |  onMouseEnter: ${hoverCount.value}x\naria: { label: "Botón de click" }  data: { testid: "click-btn" }`
  })
  return () => { stop(); app.unmount() }
}

// ============================================================
// Feature 5 — Benchmark live vs Golden
// ============================================================

const GOLDEN_MS   = 2.228  // Golden Standard registrado en benchmarks/.golden.json (5000 nodos)
const GOLDEN_N    = 500    // Demo: 500 nodos (10% del golden — escala linealmente)

function initBenchmark() {
  const runBtn   = document.getElementById('syntax-bench-run-btn')
  const barEl    = document.getElementById('syntax-bench-bar')
  const outputEl = document.getElementById('syntax-bench-output')
  if (!runBtn || !barEl || !outputEl) return

  const resultView = signal({ text: outputEl.textContent, width: barEl.style.width, overBudget: barEl.classList.contains('over-budget') })
  const stop = wireShowcase(() => {
    const view = resultView.value
    outputEl.textContent = view.text
    barEl.style.width = view.width
    barEl.classList.toggle('over-budget', view.overBudget)
  })
  const timers = new Set<ReturnType<typeof setTimeout>>()
  runBtn.addEventListener('click', () => {
    resultView.value = { text: '⏳ Ejecutando…', width: '0%', overBudget: false }

    // defer para que el repaint del UI ocurra antes del benchmark
    const timer = setTimeout(() => {
      timers.delete(timer)
      const result  = runLiveBenchmark()
      // Golden fue medido con 5000 nodos; escalamos proporcionalmente a GOLDEN_N
      const goldenScaled = GOLDEN_MS * (GOLDEN_N / 5000)
      const ratio   = result / goldenScaled
      const pct     = Math.min(ratio * 60, 100)

      const delta = ((ratio - 1) * 100).toFixed(1)
      const sign  = ratio >= 1 ? '+' : ''
      const text =
        `prepare()  ${result.toFixed(3)}ms  (${GOLDEN_N} nodos con h() + stack + For)\n` +
        `Golden escalado (${GOLDEN_N}/${5000}): ${goldenScaled.toFixed(3)}ms   Delta: ${sign}${delta}%\n` +
        (ratio <= 1.05
          ? '✅ Dentro del presupuesto (≤ +5% golden)'
          : '⚠️  Por encima del presupuesto — revisar regresión')
      resultView.value = { text, width: `${pct}%`, overBudget: ratio > 1.05 }
    }, 16)
    timers.add(timer)
  })
  return () => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    stop()
  }
}

function runLiveBenchmark(): number {
  // Construye 5000 nodos via h() + stack + For y mide prepare()
  const ITEMS = Array.from({ length: GOLDEN_N }, (_, i) => ({ id: String(i), label: `item-${i}` }))

  const BenchComponent = defineComponent(() => {
    const forNode = For({
      each: ITEMS,
      keyBy: (item) => item.id,
      children: (item) =>
        h('div', { class: 'syntax-demo-item' }, t(item.label)),
    })
    return stack({ gap: 2, padding: 0 }, forNode)
  })

  // Warm-up pass — prepare() recibe ComponentDefinition, no ComponentNode
  prepare(BenchComponent, undefined)

  // Timed pass
  const t0 = performance.now()
  prepare(BenchComponent, undefined)
  return performance.now() - t0
}
