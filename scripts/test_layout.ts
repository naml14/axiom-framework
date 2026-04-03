import { defineComponent } from './src/index.ts'
import { prepare } from './src/prepare.ts'
import { reflow } from './src/reflow.ts'

const TEXTS = [
  'Short.',
  'Medium length text that wraps nicely on most screens.',
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.',
  'A longer editorial piece that demonstrates multi-line text handling without any DOM measurement. All calculations happen in memory using pure arithmetic — the core philosophy of Axiom.',
  'Tiny.',
  'Another medium piece with enough content to show how the framework handles varying text lengths across different container widths.',
]

const Card = defineComponent((props: { title: string, body: string, colorClass: string }) => ({
  type: 'element' as const,
  tag: 'article',
  classes: ['card', props.colorClass],
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [
    { type: 'element' as const, tag: 'h3', children: [{ type: 'text' as const, content: props.title }] },
    { type: 'element' as const, tag: 'p', children: [{ type: 'text' as const, content: props.body }] },
  ],
}))

function computeColumns(width: number): number {
  if (width < 500) return 1
  if (width < 780) return 2
  if (width < 1080) return 3
  return 4
}
function distributeToColumns<T extends { estimatedHeight: number }>(items: T[], cols: number): T[][] {
  const columns: T[][] = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)
  for (const item of items) {
    const shortestCol = heights.indexOf(Math.min(...heights))
    columns[shortestCol]!.push(item)
    heights[shortestCol]! += item.estimatedHeight
  }
  return columns
}

const width = 856
const count = 20
const cols = computeColumns(width)
const colWidth = Math.floor((width - (cols - 1) * 16) / cols)

const items = Array.from({ length: count }, (_, i) => {
  const bodyText = TEXTS[i % TEXTS.length]!
  const charsPerLine = Math.max(1, Math.floor((colWidth - 32) / 8))
  const lineCount = Math.ceil((bodyText.length / charsPerLine) * 1.4)
  const estimatedHeight = 28 + lineCount * 20 + 32
  return { id: String(i), title: `Article ${i + 1}`, body: bodyText, colorClass: '', estimatedHeight }
})

const columns = distributeToColumns(items, cols)

const App = defineComponent(() => ({
  type: 'element' as const,
  tag: 'div',
  layout: { flexDirection: 'row', gap: 16 },
  children: columns.map((colItems) => ({
    type: 'element' as const,
    tag: 'div',
    layout: { width: colWidth },
    children: colItems.map(item => Card({ title: item.title, body: item.body, colorClass: item.colorClass }))
  }))
}))

const prepared = prepare(App, undefined)
// Passing 1000000 to prevent artificial limits
const layout = reflow(prepared, { maxWidth: width, maxHeight: 1000000 }, { lineHeight: 20 })

for (let i=0; i<layout.nodeCount; i++) {
  console.log(`Node ${i}: ${layout.width[i]}x${layout.height[i]} at ${layout.x[i]},${layout.y[i]}`)
}
