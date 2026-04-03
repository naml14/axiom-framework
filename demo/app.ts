import { signal, defineComponent, createApp } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'
import { TEXTS, TAGS, COLORS } from './data.js'
import { computeColumns, getTagWidth, distributeToColumns } from './layout.js'
import { TagBubble, Card, HeroCard } from './components.js'
import { initControls } from './controls.js'

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
        layout: { flexDirection: 'column', gap: 4 },
        children: (() => {
          const rows: ComponentNode[][] = [[]];
          let currentLineWidth = 0;
          const MAX_W = width - 32; // container width minus padding (16*2)

          TAGS.forEach((label, i) => {
            const tagW = getTagWidth(label);
            // Si no entra en la línea y ya hay algo, bajamos (wrap)
            if (currentLineWidth + tagW > MAX_W && rows[rows.length - 1]!.length > 0) {
              rows.push([]);
              currentLineWidth = 0;
            }
            rows[rows.length - 1]!.push(TagBubble({ label, color: COLORS[i % COLORS.length]! }));
            currentLineWidth += tagW + 2; // + gap
          });

          return rows.map(rowTags => ({
            type: 'element' as const,
            tag: 'div',
            layout: { flexDirection: 'row', gap: 2 },
            children: rowTags
          }));
        })(),
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
