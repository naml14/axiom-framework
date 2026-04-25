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
// ============================================================
// ============================================================
// Syntax v2 Showcase — 5 features interactivas
// Patrón: HTML estático con ids → initXxxShowcase(deps) → app.ts
// ============================================================

export function initSyntaxShowcase(): void {
  initHComparison()
  initLayoutDSL()
  initFlowControl()
  initEventsAttrs()
  initBenchmark()
}

// ============================================================
// Feature 1 — h() vs API Literal
// ============================================================

function initHComparison(): void {
  const literalRoot = document.getElementById('syntax-h-literal-root')
  const v2Root      = document.getElementById('syntax-h-v2-root')
  const output      = document.getElementById('syntax-h-output')
  if (!literalRoot || !v2Root || !output) return

  // ---- API Literal (el "antes") ----
  const LiteralCard = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    classes: ['syntax-demo-item'],
    layout: { flexDirection: 'column' as const, gap: 6, padding: 8 },
    children: [
      {
        type: 'element' as const,
        tag: 'div',
        classes: [],
        layout: {},
        children: [{ type: 'text' as const, content: 'API Literal' }],
      },
      {
        type: 'element' as const,
        tag: 'div',
        classes: [],
        layout: {},
        children: [{ type: 'text' as const, content: 'Más verboso, explícito.' }],
      },
    ],
  }))

  // ---- h() Syntax v2 ----
  const V2Card = defineComponent(() =>
    h('div', { class: 'syntax-demo-item', flex: 'column', gap: 6, padding: 8 },
      h('div', {}, t('Syntax v2 — h()')),
      h('div', {}, t('Menos ruido. Mismo árbol.')),
    )
  )

  const literalApp = createApp(LiteralCard, literalRoot)
  const v2App      = createApp(V2Card, v2Root)
  literalApp.mount()
  v2App.mount()

  output.textContent = '✅ Ambos árboles montados. h() produce el mismo ComponentNode que la API literal.'
}

// ============================================================
// Feature 2 — Layout DSL: stack / row / grid
// ============================================================

type LayoutMode = 'stack' | 'row' | 'grid'

function initLayoutDSL(): void {
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

  function activate(btn: HTMLElement, newMode: LayoutMode) {
    for (const b of [stackButton, rowButton, gridButton]) b.classList.remove('active')
    btn.classList.add('active')
    mode.value = newMode
    output.textContent = `mode: ${newMode} — ${ITEMS.length} items`
  }

  stackButton.addEventListener('click', () => activate(stackButton, 'stack'))
  rowButton.addEventListener('click',   () => activate(rowButton, 'row'))
  gridButton.addEventListener('click',  () => activate(gridButton, 'grid'))

  output.textContent = 'mode: stack — 4 items'
}

// ============================================================
// Feature 3 — Control de flujo: Show / For / Switch
// ============================================================

function initFlowControl(): void {
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
    toggleBtn.textContent = `Show: ${visible.value ? 'visible' : 'oculto'}`
    if (visible.value) toggleBtn.classList.add('active')
    else toggleBtn.classList.remove('active')
    outputEl.textContent = `Show.when=${visible.value}  For.length=${items.value.length}  Switch=${SWITCH_LABELS[switchStep.value % SWITCH_LABELS.length]}`
  })

  addBtn.addEventListener('click', () => {
    items.value = [...items.value, `Ítem ${items.value.length + 1}`]
    outputEl.textContent = `Show.when=${visible.value}  For.length=${items.value.length}  Switch=${SWITCH_LABELS[switchStep.value % SWITCH_LABELS.length]}`
  })

  switchBtn.addEventListener('click', () => {
    switchStep.value = switchStep.value + 1
    outputEl.textContent = `Show.when=${visible.value}  For.length=${items.value.length}  Switch=${SWITCH_LABELS[switchStep.value % SWITCH_LABELS.length]}`
  })

  outputEl.textContent = `Show.when=true  For.length=2  Switch=alpha`
}

// ============================================================
// Feature 4 — Eventos + Attrs inspector
// ============================================================

function initEventsAttrs(): void {
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

  // El output se actualiza cuando los signals cambian (el componente se re-renderiza)
  // Aquí hacemos que el outputEl refleje el estado via efecto manual en el DOM
  // (no hay efecto reactivo en el output nativo — se actualiza al re-render)
  const origMount = app.mount.bind(app)
  void origMount

  // Poll simple: actualizar el pre en cada animationFrame mientras hay interacción
  let lastClick = -1
  let lastHover = -1
  function syncOutput() {
    const c = clickCount.value
    const h2 = hoverCount.value
    if (c !== lastClick || h2 !== lastHover) {
      lastClick = c
      lastHover = h2
      output.textContent = `onClick disparado: ${c}x  |  onMouseEnter: ${h2}x\naria: { label: "Botón de click" }  data: { testid: "click-btn" }`
    }
    requestAnimationFrame(syncOutput)
  }
  syncOutput()
}

// ============================================================
// Feature 5 — Benchmark live vs Golden
// ============================================================

const GOLDEN_MS   = 2.228  // Golden Standard registrado en benchmarks/.golden.json (5000 nodos)
const GOLDEN_N    = 500    // Demo: 500 nodos (10% del golden — escala linealmente)

function initBenchmark(): void {
  const runBtn   = document.getElementById('syntax-bench-run-btn')
  const barEl    = document.getElementById('syntax-bench-bar')
  const outputEl = document.getElementById('syntax-bench-output')
  if (!runBtn || !barEl || !outputEl) return

  runBtn.addEventListener('click', () => {
    outputEl.textContent = '⏳ Ejecutando…'
    barEl.style.width = '0%'
    ;(barEl as HTMLElement).classList.remove('over-budget')

    // defer para que el repaint del UI ocurra antes del benchmark
    setTimeout(() => {
      const result  = runLiveBenchmark()
      // Golden fue medido con 5000 nodos; escalamos proporcionalmente a GOLDEN_N
      const goldenScaled = GOLDEN_MS * (GOLDEN_N / 5000)
      const ratio   = result / goldenScaled
      const pct     = Math.min(ratio * 60, 100)

      barEl.style.width = `${pct}%`
      if (ratio > 1.05) (barEl as HTMLElement).classList.add('over-budget')

      const delta = ((ratio - 1) * 100).toFixed(1)
      const sign  = ratio >= 1 ? '+' : ''
      outputEl.textContent =
        `prepare()  ${result.toFixed(3)}ms  (${GOLDEN_N} nodos con h() + stack + For)\n` +
        `Golden escalado (${GOLDEN_N}/${5000}): ${goldenScaled.toFixed(3)}ms   Delta: ${sign}${delta}%\n` +
        (ratio <= 1.05
          ? '✅ Dentro del presupuesto (≤ +5% golden)'
          : '⚠️  Por encima del presupuesto — revisar regresión')
    }, 16)
  })
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
