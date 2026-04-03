export function computeColumns(width: number): number {
  if (width < 500) return 1
  if (width < 780) return 2
  if (width < 1080) return 3
  return 4
}

export function getTagWidth(label: string): number {
  // Las mayúsculas son más anchas (aprox 8.5px), minúsculas y otros (aprox 6.5px).
  // +26px incluye padding y margen visual seguro.
  let textWidth = 0
  for (let i = 0; i < label.length; i++) {
    const char = label[i]!
    if (char >= 'A' && char <= 'Z') {
      textWidth += 8.5
    } else {
      textWidth += 6.5
    }
  }
  return Math.ceil(textWidth) + 26
}

export function distributeToColumns<T extends { estimatedHeight: number }>(
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
