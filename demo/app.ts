import { signal, defineComponent, createApp } from '../src/index.ts'
import { TEXTS, TAGS, COLORS } from './data.ts'
import { computeColumns } from './layout.ts'
import { TagBubble, Card, HeroCard } from './components.ts'
import { initControls } from './controls.ts'
import { installDomReadCounter } from './dom-read-counter.js'
import { initPortalDemo } from './portal-demo.ts'
import { initDxShowcase } from './dx-showcase.ts'
import { initRutaBShowcase } from './ruta-b-showcase.ts'
import { initSyntaxShowcase } from './syntax-showcase.ts'
import { initJsxFeature } from './syntax-jsx-feature.tsx'
import { initRouterDemo } from './router-demo.ts'
import { initContextDemo } from './context-demo.ts'
import { initFormsDemo } from './forms-demo.ts'
import { initSidebarNavigation } from './sidebar-navigation.js'

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

  // Card selection and content are demo policy; the core measures and places them.
  const cards = Array.from({ length: count }, (_, i) =>
    Card({
      title: `Article ${i + 1}`,
      body: TEXTS[i % TEXTS.length]!,
      colorClass: `accent-${COLORS[i % COLORS.length]}`,
    })
  )

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
        layout: {
          display: 'masonry',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          columnGap: 4,
          rowGap: 6,
        },
        children: cards,
      },
    ],
  }
})

// ============================================================
// App mounting
// ============================================================

const appEl = document.getElementById('app')!
appEl.style.width = `${containerWidth.value}px`

const domReads = installDomReadCounter(appEl, window)
const app = createApp(App, appEl, { lineHeight: 20 })
app.mount()
domReads.reset()

function syncContainerWidth(w: number) {
  appEl.style.width = `${w}px`
}

// ============================================================
// Controls & metrics
// ============================================================

initControls({ containerWidth, itemCount, app, appEl, domReads })
initDxShowcase({ app })

// ============================================================
// Portal Demo — initialized after main app is mounted
// ============================================================

initPortalDemo()

// ============================================================
// Router Demo — createRouter + defineAsyncComponent
// ============================================================

initRouterDemo()

// ============================================================
// Context API Demo — createContext + createStore
// ============================================================

initContextDemo()

// ============================================================
// Forms Demo — bind() + validate()
// ============================================================

initFormsDemo()

// ============================================================
// Ruta B Showcase — Grid, Responsive, Style, Animation, Plugin
// ============================================================

initRutaBShowcase({ containerWidth })

// ============================================================
// Syntax v2 Showcase — h(), Layout DSL, Flow, Events, Benchmark
// ============================================================

initSyntaxShowcase()

// ============================================================
// Syntax v2 — Feature 6: JSX
// ============================================================

initJsxFeature()
initSidebarNavigation()
// All showcases share window dimensions; exclude their initial mount reads.
domReads.reset()
