import {
  signal,
  defineComponent,
  createApp,
  createTransition,
  createAnimationState,
  scheduleTransition,
  applyImmediately,
  getTransitionProgress,
  isTransitioning,
  createTheme,
  resolveStyleTokens,
  applyStyleToElement,
  validateStyleProps,
  createPlugin,
  registerPlugin,
  clearPlugins,
  applyPluginHook,
  matchesBreakpoint,
  resolveLayoutDimension,
} from '../src/index.ts'
import type { Signal } from '../src/index.ts'

// ============================================================
// Ruta B Showcase — 6 fases: responsive, grid, style,
//   animation, plugins + v0.2.8 error envelope
// ============================================================

interface RutaBShowcaseDeps {
  containerWidth: Signal<number>
}

// ============================================================
// 1 — GRID DEMO
//    CSS Grid con measureGrid (auto-placement + spans)
//    Incluye el fix principal de ruta-b: gridRowSpan + height:'100%'
// ============================================================

function initGridDemo(): void {
  const container = document.getElementById('ruta-b-grid-root')
  if (container === null) return

  // Estado: cuántas celdas mostrar
  const cellCount = signal(6)

  const CELL_LABELS = [
    { label: 'Hero\n(rowSpan=2)', rowSpan: 2, colSpan: 1, accent: 'violet', height: '100%' as const },
    { label: 'A', rowSpan: 1, colSpan: 1, accent: 'teal', height: 60 },
    { label: 'B', rowSpan: 1, colSpan: 1, accent: 'amber', height: 60 },
    { label: 'Wide\n(colSpan=2)', rowSpan: 1, colSpan: 2, accent: 'rose', height: 60 },
    { label: 'C', rowSpan: 1, colSpan: 1, accent: 'sky', height: 60 },
    { label: 'D', rowSpan: 1, colSpan: 1, accent: 'teal', height: 60 },
  ]

  const GridDemo = defineComponent(() => {
    const count = Math.min(cellCount.value, CELL_LABELS.length)
    const cells = CELL_LABELS.slice(0, count)

    return {
      type: 'element' as const,
      tag: 'div',
      classes: ['grid-demo-canvas'],
      layout: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        rowGap: 6,
        columnGap: 6,
        height: 160,
        padding: 4,
      },
      children: cells.map((cell) => ({
        type: 'element' as const,
        tag: 'div',
        classes: ['grid-cell', `accent-${cell.accent}`, cell.rowSpan > 1 ? 'grid-cell-span-row' : '', cell.colSpan > 1 ? 'grid-cell-span-col' : ''].filter(Boolean),
        layout: {
          gridRowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          gridColumnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
          height: cell.height,
          padding: 6,
        },
        children: [
          {
            type: 'element' as const,
            tag: 'span',
            classes: ['grid-cell-label'],
            children: [{ type: 'text' as const, content: cell.label }],
          },
        ],
      })),
    }
  })

  const gridApp = createApp(GridDemo, container, { lineHeight: 16 })
  gridApp.mount()

  // Controles: añadir/quitar celdas
  const addBtn = document.getElementById('ruta-b-grid-add')
  const removeBtn = document.getElementById('ruta-b-grid-remove')
  const statusEl = document.getElementById('ruta-b-grid-status')

  function updateStatus(): void {
    if (statusEl === null) return
    const count = cellCount.value
    const hasRowSpan = count >= 1
    const hasColSpan = count >= 4
    statusEl.textContent = `${count}/${CELL_LABELS.length} celdas | rowSpan: ${hasRowSpan ? '✓' : '—'} | colSpan: ${hasColSpan ? '✓' : '—'}`
  }

  addBtn?.addEventListener('click', () => {
    if (cellCount.value < CELL_LABELS.length) {
      cellCount.value++
      updateStatus()
    }
  })

  removeBtn?.addEventListener('click', () => {
    if (cellCount.value > 1) {
      cellCount.value--
      updateStatus()
    }
  })

  updateStatus()
}

// ============================================================
// 2 — RESPONSIVE DEMO
//    Breakpoints reactivos conectados al signal containerWidth
// ============================================================

function initResponsiveDemo(containerWidth: Signal<number>): void {
  const bpInfoEl = document.getElementById('ruta-b-responsive-info')
  const bpBarEl = document.getElementById('ruta-b-responsive-bar')

  const BREAKPOINTS = [
    { label: 'xs', min: 0, max: 479, color: 'var(--accent-rose)' },
    { label: 'sm', min: 480, max: 767, color: 'var(--accent-amber)' },
    { label: 'md', min: 768, max: 1023, color: 'var(--accent-teal)' },
    { label: 'lg', min: 1024, max: 1279, color: 'var(--accent-sky)' },
    { label: 'xl', min: 1280, max: 9999, color: 'var(--accent-violet)' },
  ] as const

  function update(): void {
    const w = containerWidth.value
    const active = BREAKPOINTS.find((bp) => matchesBreakpoint(bp.min, bp.max, undefined, undefined, w, 0))
    const cols = resolveLayoutDimension('100%', { maxWidth: w, maxHeight: 600 }, 'width') ?? w

    if (bpInfoEl !== null) {
      bpInfoEl.textContent = `${w}px → breakpoint: ${active?.label ?? '?'} | 100% = ${cols.toFixed(0)}px`
    }

    if (bpBarEl !== null) {
      const pct = Math.min(100, (w / 1400) * 100)
      ;(bpBarEl as HTMLElement).style.width = `${pct}%`
      ;(bpBarEl as HTMLElement).style.background = active?.color ?? 'var(--text-muted)'
    }
  }

  // Suscribirse al signal observable con effect manual
  const origSetter = Object.getOwnPropertyDescriptor(containerWidth, 'value')?.set
  if (origSetter === undefined) {
    // Fallback: poll on animation frame (safe path)
    let last = containerWidth.value
    function poll(): void {
      const next = containerWidth.value
      if (next !== last) {
        last = next
        update()
      }
      requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  } else {
    // Parchear setter para detectar cambios
    let last = containerWidth.value
    const interval = setInterval(() => {
      const next = containerWidth.value
      if (next !== last) {
        last = next
        update()
      }
    }, 50)
    // Limpiar en cleanup no disponible aquí; el intervalo es barato
    void interval
  }

  update()
}

// ============================================================
// 3 — STYLE API DEMO
//    createTheme, resolveStyleTokens, validateStyleProps,
//    applyStyleToElement
// ============================================================

function initStyleDemo(): void {
  const outputEl = document.getElementById('ruta-b-style-output')
  const sampleEl = document.getElementById('ruta-b-style-sample')
  const applyBtn = document.getElementById('ruta-b-style-apply')
  const resetBtn = document.getElementById('ruta-b-style-reset')

  if (outputEl === null || sampleEl === null) return

  const theme = createTheme({
    color: {
      primary: '#7c3aed',
      secondary: '#0d9488',
      danger: '#e11d48',
      text: '#e4e4f4',
    },
    spacing: {
      sm: '8px',
      md: '14px',
    },
    radius: {
      md: '10px',
      lg: '14px',
    },
    typography: {
      size: { sm: '13px' },
      weight: { bold: '700' },
    },
  })

  const rawProps = {
    backgroundColor: '$color.primary',
    color: '$color.text',
    borderRadius: '$radius.lg',
    boxShadow: '0 0 24px rgba(124,58,237,0.35)',
    padding: '8px 14px',
    transition: 'all 0.2s ease',
    fontSize: '$typography.size.sm',
    fontWeight: '$typography.weight.bold',
  }

  let validationResult: { valid: boolean; error?: string } = { valid: true }
  try {
    validateStyleProps(rawProps)
  } catch (err) {
    validationResult = { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
  const resolved = resolveStyleTokens(rawProps, theme)

  outputEl.textContent = JSON.stringify(
    {
      raw: rawProps,
      validation: validationResult,
      resolved,
    },
    null,
    2
  )

  applyBtn?.addEventListener('click', () => {
    applyStyleToElement(sampleEl as HTMLElement, resolved)
    ;(sampleEl as HTMLElement).textContent = '✓ applyStyleToElement aplicado'
  })

  resetBtn?.addEventListener('click', () => {
    ;(sampleEl as HTMLElement).removeAttribute('style')
    ;(sampleEl as HTMLElement).textContent = 'Elemento de muestra'
  })
}

// ============================================================
// 4 — ANIMATION DEMO
//    createTransition, scheduleTransition, getTransitionProgress
// ============================================================

function initAnimationDemo(): void {
  const statusEl = document.getElementById('ruta-b-anim-status')
  const progressEl = document.getElementById('ruta-b-anim-progress')
  const runBtn = document.getElementById('ruta-b-anim-run')
  const cancelBtn = document.getElementById('ruta-b-anim-cancel')

  const transition = createTransition('opacity', { duration: 800, easing: 'ease-in-out' })
  const bgTransition = createTransition('backgroundColor', { duration: 600, easing: 'ease-out', delay: 100 })

  const animState = createAnimationState()
  const bgAnimState = createAnimationState()

  let rafId = 0

  function tick(): void {
    const prog = getTransitionProgress(animState)
    if (progressEl !== null) {
      progressEl.style.width = `${prog * 100}%`
    }
    if (isTransitioning(animState) || isTransitioning(bgAnimState)) {
      rafId = requestAnimationFrame(tick)
    } else {
      if (statusEl !== null) statusEl.textContent = 'Transición completada'
    }
  }

  function scheduler(fn: () => void): void {
    requestAnimationFrame(() => fn())
  }

  runBtn?.addEventListener('click', () => {
    cancelAnimationFrame(rafId)

    scheduleTransition(animState, transition, { from: '0', to: '1' }, scheduler)
    scheduleTransition(bgAnimState, bgTransition, { from: '#111128', to: '#7c3aed33' }, scheduler)

    if (statusEl !== null) statusEl.textContent = `Transición activa — duration: ${transition.duration}ms, easing: ${transition.easing}`

    rafId = requestAnimationFrame(tick)
  })

  cancelBtn?.addEventListener('click', () => {
    cancelAnimationFrame(rafId)
    // cancelTransition limpia el estado; applyImmediately requiere HTMLElement,
    // así que reseteamos el estado y la barra directamente.
    animState.activeTransition = null
    bgAnimState.activeTransition = null
    if (progressEl !== null) progressEl.style.width = '0%'
    if (statusEl !== null) statusEl.textContent = 'Transición cancelada'
  })

  // Mostrar info inicial
  if (statusEl !== null) {
    statusEl.textContent = `opacity: ${transition.duration}ms ${transition.easing} | backgroundColor: ${bgTransition.duration}ms delay:${bgTransition.delay}ms`
  }
}

// ============================================================
// 5 — PLUGIN DEMO
//    createPlugin, registerPlugin, applyPluginHook
// ============================================================

function initPluginDemo(): void {
  const logEl = document.getElementById('ruta-b-plugin-log')
  const mountBtn = document.getElementById('ruta-b-plugin-mount')
  const updateBtn = document.getElementById('ruta-b-plugin-update')
  const unmountBtn = document.getElementById('ruta-b-plugin-unmount')
  const clearBtn = document.getElementById('ruta-b-plugin-clear')

  if (logEl === null) return
  const log = logEl

  const events: string[] = []
  const MAX_LOG = 12

  function appendLog(msg: string): void {
    const ts = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    events.unshift(`[${ts}] ${msg}`)
    if (events.length > MAX_LOG) events.pop()
    log.textContent = events.join('\n')
  }

  // Limpiar registry global para que este demo sea idempotente en hot-reload
  clearPlugins()

  const loggerPlugin = createPlugin({
    name: 'demo-logger',
    onMount: (ctx) => appendLog(`onMount — appId: ${ctx.appId}`),
    onUnmount: (ctx) => appendLog(`onUnmount — appId: ${ctx.appId}`),
    onUpdate: (ctx) => appendLog(`onUpdate — appId: ${ctx.appId}`),
  })

  const metricsPlugin = createPlugin({
    name: 'demo-metrics',
    onMount: (ctx) => appendLog(`[metrics] App ${ctx.appId} montada → tracking activo`),
    onUpdate: (ctx) => appendLog(`[metrics] App ${ctx.appId} actualizada`),
  })

  registerPlugin(loggerPlugin)
  registerPlugin(metricsPlugin)

  appendLog(`2 plugins registrados: ${loggerPlugin.name}, ${metricsPlugin.name}`)

  const ctx = { appId: 'demo-ruta-b' }

  mountBtn?.addEventListener('click', () => {
    applyPluginHook('onMount', ctx)
  })

  updateBtn?.addEventListener('click', () => {
    applyPluginHook('onUpdate', ctx)
  })

  unmountBtn?.addEventListener('click', () => {
    applyPluginHook('onUnmount', ctx)
  })

  clearBtn?.addEventListener('click', () => {
    events.length = 0
    log.textContent = 'Log limpiado.'
  })
}

// ============================================================
// 6 — v0.2.8 ERROR ENVELOPE
//    Demuestra AppErrorContext con phase + nodeKey (P0-B)
// ============================================================

function initErrorEnvelopeDemo(): void {
  const outputEl = document.getElementById('ruta-b-error-output')
  const runBtn = document.getElementById('ruta-b-error-run')

  if (outputEl === null) return

  runBtn?.addEventListener('click', () => {
    const scratch = document.createElement('div')

    // Componente que lanza en prepare
    const FailingComp = defineComponent(() => {
      throw new Error('v0.2.8 envelope: forced error in component render')
    })

    type Captured = {
      error: string
      context: {
        phase: string
        displayName: string
        route: string
        cycle: number
        hydrated: boolean
        nodeKey?: string
      }
    }

    let captured: Captured | null = null

    const probeApp = createApp(FailingComp, scratch, {
      onError: (err, context) => {
        captured = {
          error: err instanceof Error ? err.message : String(err),
          context,
        }
      },
    })

    try {
      probeApp.mount()
    } catch {
      // expected
    } finally {
      probeApp.unmount()
    }

    outputEl.textContent = captured !== null
      ? JSON.stringify(captured, null, 2)
      : '⚠ No se capturó contexto — revisa que onError esté conectado'
  })
}

// ============================================================
// Entry point
// ============================================================

export function initRutaBShowcase(deps: RutaBShowcaseDeps): void {
  initGridDemo()
  initResponsiveDemo(deps.containerWidth)
  initStyleDemo()
  initAnimationDemo()
  initPluginDemo()
  initErrorEnvelopeDemo()
}
