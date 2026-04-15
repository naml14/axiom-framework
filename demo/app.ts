import { signal, defineComponent, createApp } from '../src/index.ts'
import type { ComponentNode } from '../src/index.ts'
import { TEXTS, TAGS, COLORS } from './data.ts'
import { computeColumns, distributeToColumns } from './layout.ts'
import { TagBubble, Card, HeroCard } from './components.ts'
import { initControls } from './controls.ts'
import { initPortalDemo } from './portal-demo.ts'
import { initDxShowcase } from './dx-showcase.ts'
import { initRutaBShowcase } from './ruta-b-showcase.ts'

// Activar modo desarrollo para que __AXIOM__ dev hook esté disponible en el demo
;(globalThis as { __AXIOM_DEV__?: boolean }).__AXIOM_DEV__ = true

// ============================================================
// Signals
// ============================================================

const containerWidth = signal(800)
const itemCount = signal(20)

// ============================================================
// Root App component
// ============================================================

const App = defineComponent(() => {
  const width = containerWidth.value
  const count = itemCount.value
  const cols = computeColumns(width)
  const availableWidth = width - 32
  const colWidth = Math.floor((availableWidth - (cols - 1) * 4) / cols)

  // Generate items with estimated heights for masonry distribution
  const items = Array.from({ length: count }, (_, i) => {
    const bodyText = TEXTS[i % TEXTS.length]!
    const charsPerLine = Math.max(1, Math.floor((colWidth - 32) / 6))
    const lineCount = Math.ceil(bodyText.length / charsPerLine)
    const estimatedHeight = 28 + lineCount * 20 + 32
    return {
      id: String(i),
      title: `Article ${i + 1}`,
      body: bodyText,
      colorClass: `accent-${COLORS[i % COLORS.length]}`,
      estimatedHeight,
    }
  })

  // Distribute items across columns (masonry-like)
  const columns = distributeToColumns(items, cols)

  // Build column nodes
  const columnNodes: ComponentNode[] = columns.map((colItems) => ({
    type: 'element' as const,
    tag: 'div',
    classes: ['masonry-col'],
    layout: { flexDirection: 'column', gap: 6, width: colWidth },
    children: colItems.map((item) =>
      Card({
        title: item.title,
        body: item.body,
        colorClass: item.colorClass,
      })
    ),
  }))

  return {
    type: 'element' as const,
    tag: 'div',
    classes: ['app-canvas'],
    layout: { flexDirection: 'column', gap: 16, padding: 16 },
    children: [
      // Tag cloud (Bento style dynamic wrapping)
      {
        type: 'element' as const,
        tag: 'div',
        classes: ['tags-cloud'],
        layout: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
        children: TAGS.map((label, i) => TagBubble({ label, color: COLORS[i % COLORS.length]! })),
      },
      // Hero card
      HeroCard({
        title: 'Renderizado en Dos Fases',
        body: 'Todos los cálculos ocurren en memoria. El hot path es aritmética pura. Cero lecturas DOM. Cuando cambia el ancho, el framework recalcula todo el layout sin tocar el DOM hasta el commit final.',
      }),
      // Masonry grid
      {
        type: 'element' as const,
        tag: 'div',
        classes: ['masonry-grid'],
        layout: { flexDirection: 'row', gap: 4 },
        children: columnNodes,
      },
    ],
  }
})

// ============================================================
// App mounting
// ============================================================

const appEl = document.getElementById('app')!
appEl.style.width = `${containerWidth.value}px`

const app = createApp(App, appEl, { lineHeight: 20 })
app.mount()

function syncContainerWidth(w: number) {
  appEl.style.width = `${w}px`
}

// ============================================================
// Controls & metrics
// ============================================================

initControls({ containerWidth, itemCount, app, appEl })
initDxShowcase({ app })

// ============================================================
// Portal Demo — initialized after main app is mounted
// ============================================================

initPortalDemo()

// ============================================================
// Ruta B Showcase — Grid, Responsive, Style, Animation, Plugin
// ============================================================

initRutaBShowcase({ containerWidth })
