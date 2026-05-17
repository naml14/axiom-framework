import type { PreparedComponent, LayoutResult } from '../../core/types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getLayoutProps,
} from '../prepare.js'

import { measureFlex } from './flex.js'
import { measureGrid } from './grid.js'
import { measureTextChild } from './text-measure.js'

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
  const layout = getLayoutProps(prepared)
  const gap = layout?.gap ?? 0
  let offsetY = 0

  // Count non-portal children for gap calculation
  const realChildren = children.filter(c => getNodeType(c) !== 'portal')
  let realIdx = 0

  for (const child of children) {
    // Portals are invisible to parent layout — skip entirely.
    // Portal children are CSS-managed; no layout calculation needed.
    if (getNodeType(child) === 'portal') {
      continue
    }

    const childIdx = getNodeIndex(child)
    const childWidth = availableWidth

    // Position child
    result.x[childIdx] = 0
    result.y[childIdx] = offsetY
    result.width[childIdx] = childWidth

    // Layout child
    layoutChild(child, childWidth, result, lineHeight)

    offsetY += result.height[childIdx] ?? 0
    if (realIdx < realChildren.length - 1) {
      offsetY += gap
    }
    realIdx++
  }

  // Set parent height if not already set (portals stay 0×0 — they don't occupy parent space)
  if (result.height[parentIdx] === 0 && getNodeType(prepared) !== 'portal') {
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
  const children = getPreparedChildren(prepared)

  if (nodeType === 'text') {
    measureTextChild(prepared, availableWidth, result, lineHeight)
    return
  }

  if (children.length > 0) {
    const metrics = getMetrics(prepared)
    const childLayout = getLayoutProps(prepared)
    const isGrid = childLayout?.display === 'grid'
    const hasFlexProps = childLayout?.flexDirection !== undefined
      || childLayout?.gap !== undefined
      || childLayout?.justifyContent !== undefined
      || childLayout?.alignItems !== undefined

    if (isGrid) {
      measureGrid(prepared, availableWidth, 0, result, lineHeight, childLayout)
    } else if (hasFlexProps) {
      measureFlex(prepared, availableWidth, 0, result, lineHeight, childLayout)
    } else if (metrics.simpleLayout) {
      measureSimple(prepared, availableWidth, result, lineHeight)
    }
  }
}

