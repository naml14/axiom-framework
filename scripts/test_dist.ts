function getDistForWidth(width: number) {
  const TEXTS = ['Short.', 'Medium length...', 'The quick brown fox...', 'A longer editorial...', 'Tiny.', 'Another medium piece...']
  const cols = 3
  const colWidth = Math.floor((width - (cols - 1) * 16) / cols)
  const items = Array.from({ length: 20 }, (_, i) => {
    const charsPerLine = Math.max(1, Math.floor((colWidth - 32) / 8))
    const lineCount = Math.ceil((TEXTS[i % TEXTS.length].length / charsPerLine) * 1.4)
    return { id: i, estimatedHeight: lineCount * 20 }
  })
  
  const columns: any[][] = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)
  for (const item of items) {
    const shortestCol = heights.indexOf(Math.min(...heights))
    columns[shortestCol]!.push(item.id)
    heights[shortestCol]! += item.estimatedHeight
  }
  return columns
}
console.log("984px distribution:", getDistForWidth(984))
console.log("856px distribution:", getDistForWidth(856))
