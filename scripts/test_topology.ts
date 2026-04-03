import { defineComponent } from './src/index.ts'
import { prepare, getNodeType, getTag, getChildren } from './src/prepare.ts'
import { reflow } from './src/reflow.ts'

const Card = defineComponent((props: { id: string }) => ({
  type: 'element' as const,
  tag: 'article',
  children: [{ type: 'text' as const, content: props.id }]
}))

function getAppForWidth(width: number) {
  const cols = width < 500 ? 1 : width < 780 ? 2 : width < 1080 ? 3 : 4
  const colWidth = Math.floor((width - (cols - 1) * 16) / cols)
  
  const items = Array.from({ length: 20 }, (_, i) => {
    const charsPerLine = Math.max(1, Math.floor((colWidth - 32) / 8))
    const lineCount = Math.ceil((100 / charsPerLine) * 1.4) // Dummy text length 100
    return { id: String(i), estimatedHeight: lineCount * 20 }
  })
  
  const columns: any[][] = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)
  for (const item of items) {
    const shortestCol = heights.indexOf(Math.min(...heights))
    columns[shortestCol]!.push(item)
    heights[shortestCol]! += item.estimatedHeight
  }
  
  const App = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: columns.map(colItems => ({
      type: 'element' as const,
      tag: 'div',
      children: colItems.map(item => Card({ id: item.id }))
    }))
  }))
  return App(undefined)
}

const node984 = getAppForWidth(984)
const prep984 = prepare({ _fn: () => node984 } as any, undefined)
const node856 = getAppForWidth(856)
const prep856 = prepare({ _fn: () => node856 } as any, undefined)

function isSameTopology(a: any, b: any): boolean {
  if (getNodeType(a) !== getNodeType(b)) return false
  if (getTag(a) !== getTag(b)) return false
  
  const aChildren = getChildren(a)
  const bChildren = getChildren(b)
  if (aChildren.length !== bChildren.length) return false
  
  for (let i = 0; i < aChildren.length; i++) {
    if (!isSameTopology(aChildren[i]!, bChildren[i]!)) return false
  }
  return true
}

console.log("Is Same Topology between 984 and 856:", isSameTopology(prep984, prep856))
