import type { PreparedComponent, LayoutResult, LayoutProps, FlexDirection, FlexWrap, JustifyContent, AlignItems } from './types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getTextHandle,
  getTextContent,
  getLayoutProps,
} from './prepare.js'

import { measureSimple } from './fast-path.js'

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

interface FlexLine {
  items: { child: PreparedComponent, size: Size, childIdx: number }[]
  mainSize: number
  crossSize: number
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
  const wrap = layout?.flexWrap ?? 'nowrap'
  const axis = getAxis(direction)
  const gap = layout?.gap ?? 0
  const justifyContent = layout?.justifyContent ?? 'start'
  const alignItems = layout?.alignItems ?? 'start'
  const padding = layout?.padding ?? 0

  const parentSize: Size = { width: availableWidth, height: availableHeight }
  const mainAxisSize = axis.mainSize(parentSize) - padding * 2
  const crossAxisSize = axis.crossSize(parentSize) - padding * 2

  const lines: FlexLine[] = []
  let currentLine: FlexLine = { items: [], mainSize: 0, crossSize: 0 }

  for (const child of children) {
    const childLayout = getLayoutProps(child)
    
    let childWidth = childLayout?.width
    if (childWidth === undefined) {
      childWidth = direction === 'column' ? crossAxisSize : availableWidth
    }
    
    let childHeight = childLayout?.height ?? 0
    const childIdx = getNodeIndex(child)

    result.width[childIdx] = childWidth
    result.height[childIdx] = childHeight

    if (getNodeType(child) === 'text') {
      measureTextChild(child, childWidth, result, lineHeight)
    }

    if (getNodeType(child) === 'element' && getPreparedChildren(child).length > 0) {
      const childMetrics = getMetrics(child)
      const childHasFlex = childLayout?.flexDirection !== undefined
      if (!childHasFlex && childMetrics.simpleLayout && (childLayout?.padding ?? 0) === 0 && childLayout?.gap === undefined) {
        layoutChildFast(child, childWidth, result, lineHeight)
      } else {
        measureFlex(child, childWidth, childHeight > 0 ? childHeight : availableHeight, result, lineHeight, childLayout)
      }
    }

    const size = { width: result.width[childIdx], height: result.height[childIdx] }
    const itemMainSize = axis.main(size)
    const itemCrossSize = axis.cross(size)

    if (wrap !== 'nowrap' && currentLine.items.length > 0) {
      if (currentLine.mainSize + gap + itemMainSize > mainAxisSize) {
        lines.push(currentLine)
        currentLine = { items: [], mainSize: 0, crossSize: 0 }
      }
    }

    if (currentLine.items.length > 0) {
      currentLine.mainSize += gap
    }
    currentLine.mainSize += itemMainSize
    if (itemCrossSize > currentLine.crossSize) {
      currentLine.crossSize = itemCrossSize
    }
    currentLine.items.push({ child, size, childIdx })
  }

  if (currentLine.items.length > 0) {
    lines.push(currentLine)
  }

  // Flex behavior: If there's only one line, it stretches to fill the available cross space (align-content default).
  // This satisfies 'alignItems' which operates relative to the line's cross size.
  // IMPORTANT: For 'row' without explicit height, availableHeight is just a constraint, not a real size.
  // We must not stretch it, otherwise it creates an infinite layout loop with root.clientHeight!
  let shouldStretchLine = false
  if (lines.length === 1 && crossAxisSize > 0) {
    if (direction === 'row') {
      shouldStretchLine = layout?.height !== undefined
    } else {
      // For column, we always stretch to the width constraint because block elements fill width.
      shouldStretchLine = true
    }
  }

  if (shouldStretchLine) {
    lines[0]!.crossSize = Math.max(lines[0]!.crossSize, crossAxisSize)
  }

  if (wrap === 'wrap-reverse') {
    lines.reverse()
  }

  // Layout lines along cross axis
  let crossOffset = padding
  for (let l = 0; l < lines.length; l++) {
    const line = lines[l]!
    let mainOffset = padding
    const freeSpace = Math.max(0, mainAxisSize - line.mainSize)

    if (justifyContent === 'center') {
      mainOffset += freeSpace / 2
    } else if (justifyContent === 'end') {
      mainOffset += freeSpace
    } else if (justifyContent === 'space-between' && line.items.length > 1) {
      const gapBetween = freeSpace / (line.items.length - 1)
      for (let i = 0; i < line.items.length; i++) {
        const item = line.items[i]!
        const pos = axis.compose(
          mainOffset,
          crossOffset + getCrossOffset(alignItems, item.size, line.crossSize, 0, direction)
        )
        result.x[item.childIdx] = pos.x
        result.y[item.childIdx] = pos.y
        mainOffset += axis.main(item.size) + gap + gapBetween
      }
      crossOffset += line.crossSize + (l < lines.length - 1 ? gap : 0)
      continue
    }

    for (const item of line.items) {
      const pos = axis.compose(
        mainOffset,
        crossOffset + getCrossOffset(alignItems, item.size, line.crossSize, 0, direction)
      )
      result.x[item.childIdx] = pos.x
      result.y[item.childIdx] = pos.y

      mainOffset += axis.main(item.size) + gap
    }

    crossOffset += line.crossSize + (l < lines.length - 1 ? gap : 0)
  }

  // Calculate parent dimensions
  if (result.height[parentIdx] === 0) {
    if (direction === 'column') {
      let maxMain = 0
      for (const line of lines) {
        if (line.mainSize > maxMain) maxMain = line.mainSize
      }
      result.height[parentIdx] = maxMain + padding * 2
    } else {
      let totalCross = 0
      for (let i = 0; i < lines.length; i++) {
        totalCross += lines[i]!.crossSize
        if (i < lines.length - 1) totalCross += gap
      }
      result.height[parentIdx] = totalCross + padding * 2
    }
  }
}

function getCrossOffset(
  alignItems: AlignItems,
  childSize: Size,
  crossSize: number,
  padding: number,
  direction: FlexDirection
): number {
  const childCross = direction === 'row' ? childSize.height : childSize.width
  if (alignItems === 'center') {
    return padding + (crossSize - childCross) / 2
  }
  if (alignItems === 'end') {
    return padding + crossSize - childCross
  }
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
  let text: string | undefined
  if (textHandle !== undefined) {
    text = (textHandle as { text: string }).text
  } else {
    text = getTextContent(prepared)
  }

  if (text !== undefined && text.length > 0) {
    const charWidth = 8
    const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth))
    const lineCount = Math.max(1, Math.ceil((text.length / charsPerLine) * 1.4))
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
  measureSimple(prepared, availableWidth, result, lineHeight)
}
