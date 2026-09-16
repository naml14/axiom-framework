import type {
  PreparedComponent,
  LayoutResult,
  LayoutProps,
  FlexDirection,
  JustifyContent,
  AlignItems,
  LayoutConstraints,
} from '../../core/types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getLayoutProps,
} from '../prepare.js'

import { measureSimple } from './fast-path.js'
import { resolveResponsiveLayout } from '../strategy/responsive.js'
import { measureGrid } from './grid.js'
import { measureTextChild } from './text-measure.js'
import { acquireFlexScratch, releaseFlexScratch, takeFlexItem, type FlexLineScratch } from './scratch.js'

// ============================================================
// FlexAxis Abstraction
// ============================================================

interface Size { width: number; height: number }
interface Position { x: number; y: number }

/**
 * Minimal view over an item's size — used by the axis helpers so they can
 * read either a runtime `Size` object (for parent constraints) or the flat
 * `sizeWidth`/`sizeHeight` fields of a `FlexLineItemScratch`.
 */
interface ItemSize { sizeWidth: number, sizeHeight: number }

interface FlexAxis {
  main(item: ItemSize): number
  cross(item: ItemSize): number
  compose(mainPos: number, crossPos: number): Position
  mainSize(parentSize: Size): number
  crossSize(parentSize: Size): number
}

const ROW_AXIS: FlexAxis = {
  main: (s) => s.sizeWidth,
  cross: (s) => s.sizeHeight,
  compose: (m, c) => ({ x: m, y: c }),
  mainSize: (s) => s.width,
  crossSize: (s) => s.height,
}

const COLUMN_AXIS: FlexAxis = {
  main: (s) => s.sizeHeight,
  cross: (s) => s.sizeWidth,
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

// ============================================================
// Flex Layout
// ============================================================

export function measureFlex(
  prepared: PreparedComponent,
  availableWidth: number,
  availableHeight: number,
  result: LayoutResult,
  lineHeight: number,
  layout?: LayoutProps,
  constraints?: LayoutConstraints
): void {
  const resolvedLayout = resolveResponsiveLayout(layout, constraints ?? {
    maxWidth: availableWidth,
    maxHeight: availableHeight,
  })

  const children = getPreparedChildren(prepared)
  const parentIdx = getNodeIndex(prepared)
  const direction = resolvedLayout?.flexDirection ?? 'column'
  const wrap = resolvedLayout?.flexWrap ?? 'nowrap'
  const axis = getAxis(direction)
  const gap = resolvedLayout?.gap ?? 0
  const justifyContent = resolvedLayout?.justifyContent ?? 'start'
  const alignItems = resolvedLayout?.alignItems ?? 'start'
  const padding = resolvedLayout?.padding ?? 0

  const parentSize: Size = { width: availableWidth, height: availableHeight }
  const mainAxisSize = axis.mainSize(parentSize) - padding * 2
  const crossAxisSize = axis.crossSize(parentSize) - padding * 2

  // Scratch buffers recycled across flex calls — see ./scratch.ts.
  // The linePool + currentLineIdx pattern guarantees that completed lines
  // pushed into `lines[]` keep their own data: each line is a distinct
  // pre-allocated object, not a single reference we reset in place.
  const scratch = acquireFlexScratch()
  const lines: FlexLineScratch[] = scratch.lines

  function currentLine(): FlexLineScratch {
    return scratch.linePool[scratch.currentLineIdx]!
  }

  try {

  for (const child of children) {
    // Portals are invisible to flex layout — skip entirely.
    // Portal children are CSS-managed; no layout calculation needed.
    if (getNodeType(child) === 'portal') {
      const childIdx = getNodeIndex(child)
      result.width[childIdx] = 0
      result.height[childIdx] = 0
      continue
    }

    const childConstraintWidth = direction === 'column' ? crossAxisSize : availableWidth
    const childConstraints: LayoutConstraints = {
      maxWidth: childConstraintWidth,
      maxHeight: availableHeight,
      viewportWidth: constraints?.viewportWidth,
      viewportHeight: constraints?.viewportHeight,
    }

    const childLayout = resolveResponsiveLayout(getLayoutProps(child), childConstraints)
    
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
      const childIsGrid = childLayout?.display === 'grid'
      if (!childHasFlex && !childIsGrid && childMetrics.simpleLayout && (childLayout?.padding ?? 0) === 0 && childLayout?.gap === undefined) {
        layoutChildFast(child, childWidth, result, lineHeight)
      } else {
        if (childIsGrid) {
          measureGrid(
            child,
            childWidth,
            childHeight > 0 ? childHeight : availableHeight,
            result,
            lineHeight,
            childLayout,
            {
              maxWidth: childWidth,
              maxHeight: childHeight > 0 ? childHeight : availableHeight,
              viewportWidth: childConstraints.viewportWidth,
              viewportHeight: childConstraints.viewportHeight,
            }
          )
        } else {
          measureFlex(
            child,
            childWidth,
            childHeight > 0 ? childHeight : availableHeight,
            result,
            lineHeight,
            childLayout,
            {
              maxWidth: childWidth,
              maxHeight: childHeight > 0 ? childHeight : availableHeight,
              viewportWidth: childConstraints.viewportWidth,
              viewportHeight: childConstraints.viewportHeight,
            }
          )
        }
      }
    }

    const sizeW = result.width[childIdx]
    const sizeH = result.height[childIdx]
    const itemMainSize = direction === 'row' ? sizeW : sizeH
    const itemCrossSize = direction === 'row' ? sizeH : sizeW

    if (wrap !== 'nowrap' && currentLine().itemCount > 0) {
      if (currentLine().mainSize + gap + itemMainSize > mainAxisSize) {
        // Wrap: commit current line, advance to a fresh one in linePool.
        lines.push(currentLine())
        scratch.currentLineIdx++
        const next = currentLine()
        next.items.length = 0
        next.itemCount = 0
        next.mainSize = 0
        next.crossSize = 0
      }
    }

    const line = currentLine()
    if (line.itemCount > 0) {
      line.mainSize += gap
    }
    line.mainSize += itemMainSize
    if (itemCrossSize > line.crossSize) {
      line.crossSize = itemCrossSize
    }
    const item = takeFlexItem(scratch)
    item.child = child
    item.sizeWidth = sizeW
    item.sizeHeight = sizeH
    item.childIdx = childIdx
    line.items.push(item)
    line.itemCount++
  }

  if (currentLine().itemCount > 0) {
    lines.push(currentLine())
  }

  // Flex behavior: If there's only one line, it stretches to fill the available cross space (align-content default).
  // This satisfies 'alignItems' which operates relative to the line's cross size.
  // IMPORTANT: For 'row' without explicit height, availableHeight is just a constraint, not a real size.
  // We must not stretch it, otherwise it creates an infinite layout loop with root.clientHeight!
  let shouldStretchLine = false
  if (lines.length === 1 && crossAxisSize > 0) {
    if (direction === 'row') {
      shouldStretchLine = resolvedLayout?.height !== undefined
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
    } else if (justifyContent === 'space-between' && line.itemCount > 1) {
      const gapBetween = freeSpace / (line.itemCount - 1)
      for (let i = 0; i < line.itemCount; i++) {
        const item = line.items[i]!
        const pos = axis.compose(
          mainOffset,
          crossOffset + getCrossOffset(alignItems, item, line.crossSize, 0, direction)
        )
        result.x[item.childIdx] = pos.x
        result.y[item.childIdx] = pos.y
        mainOffset += axis.main(item) + gap + gapBetween
      }
      crossOffset += line.crossSize + (l < lines.length - 1 ? gap : 0)
      continue
    } else if (justifyContent === 'space-around') {
      const spacePerItem = line.itemCount > 0 ? freeSpace / line.itemCount : 0
      mainOffset += spacePerItem / 2
      for (let i = 0; i < line.itemCount; i++) {
        const item = line.items[i]!
        const pos = axis.compose(
          mainOffset,
          crossOffset + getCrossOffset(alignItems, item, line.crossSize, 0, direction)
        )
        result.x[item.childIdx] = pos.x
        result.y[item.childIdx] = pos.y
        mainOffset += axis.main(item) + gap + spacePerItem
      }
      crossOffset += line.crossSize + (l < lines.length - 1 ? gap : 0)
      continue
    }

    for (let i = 0; i < line.itemCount; i++) {
      const item = line.items[i]!
      const pos = axis.compose(
        mainOffset,
        crossOffset + getCrossOffset(alignItems, item, line.crossSize, 0, direction)
      )
      result.x[item.childIdx] = pos.x
      result.y[item.childIdx] = pos.y

      mainOffset += axis.main(item) + gap
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

  } finally {
    releaseFlexScratch(scratch)
  }
}

function getCrossOffset(
  alignItems: AlignItems,
  child: { sizeWidth: number, sizeHeight: number },
  crossSize: number,
  padding: number,
  direction: FlexDirection
): number {
  const childCross = direction === 'row' ? child.sizeHeight : child.sizeWidth
  if (alignItems === 'center' || alignItems === 'baseline') {
    return padding + (crossSize - childCross) / 2
  }
  if (alignItems === 'end') {
    return padding + crossSize - childCross
  }
  return padding
}

function layoutChildFast(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  measureSimple(prepared, availableWidth, result, lineHeight)
}
