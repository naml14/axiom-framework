import type { PreparedComponent, LayoutResult, LayoutProps, FlexDirection, JustifyContent, AlignItems } from './types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getTextHandle,
  getTextContent,
  getLayoutProps,
} from './prepare.js'

// ============================================================
// FlexAxis Abstraction
// ============================================================

interface Size { width: number; height: number }
interface Position { x: number; y: number }

interface FlexAxis {
  main(size: Size): number
  cross(size: Size): number
  compose(mainPos: number, crossPos: number): Position
  mainSize(parentSize: Size): number
  crossSize(parentSize: Size): number
}

const ROW_AXIS: FlexAxis = {
  main: (s) => s.width,
  cross: (s) => s.height,
  compose: (m, c) => ({ x: m, y: c }),
  mainSize: (s) => s.width,
  crossSize: (s) => s.height,
}

const COLUMN_AXIS: FlexAxis = {
  main: (s) => s.height,
  cross: (s) => s.width,
  compose: (m, c) => ({ x: c, y: m }),
  mainSize: (s) => s.height,
  crossSize: (s) => s.width,
}

function getAxis(direction: FlexDirection): FlexAxis {
  return direction === 'row' ? ROW_AXIS : COLUMN_AXIS
}

// ============================================================
// Flex Layout
// ============================================================

export function measureFlex(
  prepared: PreparedComponent,
  availableWidth: number,
  availableHeight: number,
  result: LayoutResult,
  lineHeight: number,
  layout?: LayoutProps
): void {
  const children = getPreparedChildren(prepared)
  const parentIdx = getNodeIndex(prepared)
  const direction = layout?.flexDirection ?? 'column'
  const axis = getAxis(direction)
  const gap = layout?.gap ?? 0
  const justifyContent = layout?.justifyContent ?? 'start'
  const alignItems = layout?.alignItems ?? 'start'
  const padding = layout?.padding ?? 0

  const parentSize: Size = { width: availableWidth, height: availableHeight }
  const mainAxisSize = axis.mainSize(parentSize) - padding * 2
  const crossAxisSize = axis.crossSize(parentSize) - padding * 2

  // Measure children first to know their sizes
  const childSizes: Size[] = []
  for (const child of children) {
    const childLayout = getLayoutProps(child)
    const childWidth = childLayout?.width ?? crossAxisSize
    const childHeight = childLayout?.height ?? 0
    const childIdx = getNodeIndex(child)

    result.width[childIdx] = childWidth
    result.height[childIdx] = childHeight

    // Layout text children
    if (getNodeType(child) === 'text') {
      measureTextChild(child, childWidth, result, lineHeight)
    }

    // Layout element children
    if (getNodeType(child) === 'element' && getPreparedChildren(child).length > 0) {
      const childMetrics = getMetrics(child)
      const childHasFlex = childLayout?.flexDirection !== undefined
      if (!childHasFlex && childMetrics.simpleLayout && (childLayout?.padding ?? 0) === 0 && childLayout?.gap === undefined) {
        // Fast path for child
        layoutChildFast(child, childWidth, result, lineHeight)
      } else {
        // Flex path for child
        measureFlex(child, childWidth, childHeight > 0 ? childHeight : availableHeight, result, lineHeight, childLayout)
      }
    }

    childSizes.push({ width: result.width[childIdx], height: result.height[childIdx] })
  }

  // Calculate main axis total
  let totalMain = 0
  for (let i = 0; i < childSizes.length; i++) {
    totalMain += axis.main(childSizes[i]!)
    if (i < childSizes.length - 1) totalMain += gap
  }

  // Justify content
  let mainOffset = padding
  const freeSpace = Math.max(0, mainAxisSize - totalMain)

  if (justifyContent === 'center') {
    mainOffset += freeSpace / 2
  } else if (justifyContent === 'end') {
    mainOffset += freeSpace
  } else if (justifyContent === 'space-between' && childSizes.length > 1) {
    const gapBetween = freeSpace / (childSizes.length - 1)
    for (let i = 0; i < children.length; i++) {
      const childIdx = getNodeIndex(children[i]!)
      const pos = axis.compose(
        mainOffset,
        getCrossOffset(alignItems, childSizes[i]!, crossAxisSize, padding)
      )
      result.x[childIdx] = pos.x
      result.y[childIdx] = pos.y
      mainOffset += axis.main(childSizes[i]!) + gap + gapBetween
    }
    return
  }

  // Position children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    const childIdx = getNodeIndex(child)
    const size = childSizes[i]!

    const pos = axis.compose(
      mainOffset,
      getCrossOffset(alignItems, size, crossAxisSize, padding)
    )
    result.x[childIdx] = pos.x
    result.y[childIdx] = pos.y

    mainOffset += axis.main(size) + gap
  }
}

function getCrossOffset(
  alignItems: AlignItems,
  childSize: Size,
  crossSize: number,
  padding: number
): number {
  const childCross = childSize.height // simplified
  if (alignItems === 'center') {
    return padding + (crossSize - childCross) / 2
  }
  if (alignItems === 'end') {
    return padding + crossSize - childCross
  }
  // start
  return padding
}

function measureTextChild(
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

function layoutChildFast(
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
    result.x[childIdx] = 0
    result.y[childIdx] = offsetY
    result.width[childIdx] = availableWidth

    if (getNodeType(child) === 'text') {
      measureTextChild(child, availableWidth, result, lineHeight)
    }
    offsetY += result.height[childIdx]
  }

  if (result.height[parentIdx] === 0) {
    result.height[parentIdx] = offsetY
  }
}
