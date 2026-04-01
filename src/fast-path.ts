import type { PreparedComponent, LayoutResult, LayoutProps } from './types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getTextHandle,
  getTextContent,
} from './prepare.js'

// ============================================================
// Fast Path — simple top-to-bottom block layout
// No flex, no gap, no padding, no percentages
// ============================================================

export function measureSimple(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  const children = getPreparedChildren(prepared)
  const parentIdx = getNodeIndex(prepared)
  let offsetY = 0

  for (const child of children) {
    const childIdx = getNodeIndex(child)
    const childWidth = availableWidth

    // Position child
    result.x[childIdx] = 0
    result.y[childIdx] = offsetY
    result.width[childIdx] = childWidth

    // Layout child
    layoutChild(child, childWidth, result, lineHeight)

    offsetY += result.height[childIdx]
  }

  // Set parent height if not already set
  if (result.height[parentIdx] === 0) {
    result.height[parentIdx] = offsetY
  }
}

function layoutChild(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  const nodeType = getNodeType(prepared)
  const idx = getNodeIndex(prepared)
  const children = getPreparedChildren(prepared)

  if (nodeType === 'text') {
    measureText(prepared, availableWidth, result, lineHeight)
    return
  }

  if (children.length > 0) {
    const metrics = getMetrics(prepared)
    if (metrics.simpleLayout) {
      measureSimple(prepared, availableWidth, result, lineHeight)
    }
  }
}

function measureText(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  const idx = getNodeIndex(prepared)
  const textHandle = getTextHandle(prepared)

  // Resolve text content — prefer pretext handle, fallback to raw textContent
  let text: string | undefined
  if (textHandle !== undefined) {
    text = (textHandle as { text: string }).text
  } else {
    text = getTextContent(prepared)
  }

  if (text !== undefined && text.length > 0) {
    const charWidth = 6
    const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth))
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine))
    result.height[idx] = lineCount * lineHeight
    result.width[idx] = availableWidth
  }
}
