import { signal, defineComponent, createApp } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

// ============================================================
// Data
// ============================================================

const TEXTS = [
  'Short.',
  'Medium length text that wraps nicely on most screens.',
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.',
  'A longer editorial piece that demonstrates multi-line text handling without any DOM measurement. All calculations happen in memory using pure arithmetic — the core philosophy of Axiom.',
  'Tiny.',
  'Another medium piece with enough content to show how the framework handles varying text lengths across different container widths.',
]

const TAGS = ['TypeScript', 'Performance', 'Web', 'Signals', 'Layout', 'DOM-free', 'Reactive', 'Fast']
const COLORS = ['violet', 'teal', 'amber', 'rose', 'sky']

// ============================================================
// Signals
// ============================================================

const containerWidth = signal(800)
const itemCount = signal(20)
let animating = false

// ============================================================
// Layout helpers
// ============================================================

function computeColumns(width: number): number {
  if (width < 500) return 1
  if (width < 780) return 2
  if (width < 1080) return 3
  return 4
}

function getTagWidth(label: string): number {
  // Las mayúsculas son más anchas (aprox 8.5px), minúsculas y otros (aprox 6.5px).
  // +26px incluye padding y margen visual seguro.
  let textWidth = 0;
  for (let i = 0; i < label.length; i++) {
    const char = label[i]!;
    if (char >= 'A' && char <= 'Z') {
      textWidth += 8.5;
    } else {
      textWidth += 6.5;
    }
  }
  return Math.ceil(textWidth) + 26;
}

function distributeToColumns<T extends { estimatedHeight: number }>(
  items: T[],
  cols: number
): T[][] {
  const columns: T[][] = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)

  for (const item of items) {
    const shortestCol = heights.indexOf(Math.min(...heights))
    columns[shortestCol]!.push(item)
    heights[shortestCol]! += item.estimatedHeight
  }

  return columns
}

// ============================================================
// Components
// ============================================================

const TagBubble = defineComponent((props: { label: string; color: string }) => {
  const calcWidth = getTagWidth(props.label);
  
  return {
    type: 'element' as const,
    tag: 'span',
    layout: { width: calcWidth, height: 20 },
    classes: ['tag-bubble', `tag-${props.color}`],
    children: [{ type: 'text' as const, content: props.label }],
  }
})

const Card = defineComponent((props: {
  title: string
  body: string
  colorClass: string
}) => ({
  type: 'element' as const,
  tag: 'article',
  layout: { flexDirection: 'column', gap: 5, padding: 10 },
  classes: ['card', props.colorClass],
  children: [
    {
      type: 'element' as const,
      tag: 'h3',
      classes: ['card-title'],
      children: [{ type: 'text' as const, content: props.title }],
    },
    {
      type: 'element' as const,
      tag: 'p',
      classes: ['card-body'],
      children: [{ type: 'text' as const, content: props.body }],
    },
  ],
}))

const HeroCard = defineComponent((props: { title: string; body: string }) => ({
  type: 'element' as const,
  tag: 'div',
  layout: { flexDirection: 'column', gap: 5, padding: 10 },
  classes: ['card', 'card-hero'],
  children: [
    {
      type: 'element' as const,
      tag: 'div',
      classes: ['hero-badge'],
      children: [{ type: 'text' as const, content: '⚡ AXIOM FRAMEWORK' }],
    },
    {
      type: 'element' as const,
      tag: 'h2',
      classes: ['hero-title'],
      children: [{ type: 'text' as const, content: props.title }],
    },
    {
      type: 'element' as const,
      tag: 'p',
      classes: ['hero-body'],
      children: [{ type: 'text' as const, content: props.body }],
    },
  ],
}))

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
// Metrics display (direct DOM — NOT through framework)
// ============================================================

const mPrepare = document.getElementById('m-prepare')!
const mReflow = document.getElementById('m-reflow')!
const mCommit = document.getElementById('m-commit')!
const mTotal = document.getElementById('m-total')!
const mFps = document.getElementById('m-fps')!

let frameCount = 0
let lastFpsTime = performance.now()
let currentFps = 0

function updateMetrics() {
  const m = app.getMetrics()
  mPrepare.textContent = `${m.prepareMs.toFixed(2)}ms`
  mReflow.textContent = `${m.reflowMs.toFixed(2)}ms`
  mCommit.textContent = `${m.commitMs.toFixed(2)}ms`
  mTotal.textContent = `${(m.prepareMs + m.reflowMs + m.commitMs).toFixed(2)}ms`

  // FPS calculation
  frameCount++
  const now = performance.now()
  if (now - lastFpsTime >= 1000) {
    currentFps = frameCount
    frameCount = 0
    lastFpsTime = now
    mFps.textContent = String(currentFps)
  }
}

// ============================================================
// Animation
// ============================================================

let animRaf = 0
let animDir = 1
const ANIM_MIN = 360
const ANIM_MAX = 1240
const ANIM_STEP = 6

function animTick() {
  if (!animating) return
  const next = containerWidth.value + animDir * ANIM_STEP
  if (next >= ANIM_MAX || next <= ANIM_MIN) animDir *= -1
  const newWidth = Math.max(ANIM_MIN, Math.min(ANIM_MAX, next))
  containerWidth.value = newWidth
  syncContainerWidth(newWidth)

  // Update slider to reflect animation
  widthSlider.value = String(newWidth)
  widthDisplay.textContent = `${newWidth}px`

  // Update metrics after render settles
  requestAnimationFrame(() => updateMetrics())
  animRaf = requestAnimationFrame(animTick)
}

// ============================================================
// Controls
// ============================================================

const widthSlider = document.getElementById('width-slider') as HTMLInputElement
const widthDisplay = document.getElementById('width-display')!
const itemsSlider = document.getElementById('items-slider') as HTMLInputElement
const itemsDisplay = document.getElementById('items-display')!
const animBtn = document.getElementById('anim-btn')!
const metricsBtn = document.getElementById('metrics-btn')!
const metricsFooter = document.getElementById('metrics-footer')!

widthSlider.addEventListener('input', () => {
  const w = Number(widthSlider.value)
  containerWidth.value = w
  widthDisplay.textContent = `${w}px`
  syncContainerWidth(w)
  requestAnimationFrame(() => updateMetrics())
})

itemsSlider.addEventListener('input', () => {
  const n = Number(itemsSlider.value)
  itemCount.value = n
  itemsDisplay.textContent = String(n)
  requestAnimationFrame(() => updateMetrics())
})

animBtn.addEventListener('click', () => {
  animating = !animating
  animBtn.classList.toggle('active', animating)
  animBtn.textContent = animating ? '▶ Animación' : '⏸ Animación'
  if (animating) {
    animRaf = requestAnimationFrame(animTick)
  } else {
    cancelAnimationFrame(animRaf)
  }
})

metricsBtn.addEventListener('click', () => {
  const isVisible = metricsFooter.style.display !== 'none'
  metricsFooter.style.display = isVisible ? 'none' : 'flex'
  metricsBtn.classList.toggle('active', !isVisible)
})

// Initial metrics display
requestAnimationFrame(() => updateMetrics())
