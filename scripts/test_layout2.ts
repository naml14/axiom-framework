import { defineComponent } from './src/index.ts'
import { prepare } from './src/prepare.ts'
import { reflow } from './src/reflow.ts'

const Card = defineComponent(() => ({
  type: 'element' as const,
  tag: 'article',
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [{ type: 'element' as const, tag: 'h3', children: [{ type: 'text' as const, content: 'Title' }] }],
}))

const App = defineComponent(() => ({
  type: 'element' as const,
  tag: 'div',
  layout: { flexDirection: 'row', gap: 16 },
  children: [
    {
      type: 'element' as const,
      tag: 'div',
      layout: { width: 200 },
      children: [Card(undefined)]
    }
  ]
}))

const prepared = prepare(App, undefined)
const layout = reflow(prepared, { maxWidth: 856, maxHeight: 1000 }, { lineHeight: 20 })

for (let i = 0; i < layout.nodeCount; i++) {
  console.log(`Node ${i}: ${layout.width[i]}x${layout.height[i]} at ${layout.x[i]},${layout.y[i]}`)
}
