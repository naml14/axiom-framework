import type { PreparedComponent, LayoutResult, LayoutProps, LayoutConstraints } from '../../core/types.js'
import { getNodeIndex, getPreparedChildren, getNodeType, getLayoutProps } from '../prepare.js'
import { resolveResponsiveLayout } from '../strategy/responsive.js'
import { resolveColumnCount, measureGridChildContents } from './grid.js'
import { measureTextChild } from './text-measure.js'
import { acquireGridScratch, releaseGridScratch } from './scratch.js'

/** Fixed-width columns, placing each item in the leftmost shortest column. */
export function measureMasonry(
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
  const padding = resolvedLayout?.padding ?? 0
  const gap = resolvedLayout?.gap ?? 0
  const columnGap = resolvedLayout?.columnGap ?? gap
  const rowGap = resolvedLayout?.rowGap ?? gap
  const columns = resolveColumnCount(resolvedLayout?.gridTemplateColumns)
  const innerWidth = Math.max(0, availableWidth - padding * 2)
  const columnWidth = Math.max(0, (innerWidth - (columns - 1) * columnGap) / columns)
  const parentIdx = getNodeIndex(prepared)

  // Grid's recycled numeric buffer holds the next available Y in each column.
  // Recursive engines acquire their own scratch; always return ours on failure.
  const scratch = acquireGridScratch()
  const columnHeights = scratch.rowHeights
  try {
    for (let column = 0; column < columns; column++) columnHeights[column] = 0
    let tallest = 0
    for (const child of getPreparedChildren(prepared)) {
      const childIdx = getNodeIndex(child)
      const nodeType = getNodeType(child)
      if (nodeType === 'portal') {
        result.width[childIdx] = 0
        result.height[childIdx] = 0
        continue
      }

      let column = 0
      for (let candidate = 1; candidate < columns; candidate++) {
        if (columnHeights[candidate]! < columnHeights[column]!) column = candidate
      }
      const childConstraints: LayoutConstraints = {
        maxWidth: columnWidth,
        maxHeight: availableHeight,
        viewportWidth: constraints?.viewportWidth,
        viewportHeight: constraints?.viewportHeight,
      }
      const childLayout = resolveResponsiveLayout(getLayoutProps(child), childConstraints)
      const childWidth = childLayout?.width ?? columnWidth
      const childHeight = childLayout?.height ?? 0
      result.width[childIdx] = childWidth
      result.height[childIdx] = childHeight
      if (nodeType === 'text') {
        measureTextChild(child, childWidth, result, lineHeight)
      } else if (nodeType === 'element' && getPreparedChildren(child).length > 0) {
        childConstraints.maxWidth = childWidth
        childConstraints.maxHeight = childHeight > 0 ? childHeight : availableHeight
        measureGridChildContents(child, childWidth, childConstraints.maxHeight, result, lineHeight, childLayout, childConstraints)
      }

      const y = columnHeights[column]!
      result.x[childIdx] = padding + column * (columnWidth + columnGap)
      result.y[childIdx] = padding + y
      const bottom = y + result.height[childIdx]!
      columnHeights[column] = bottom + rowGap
      if (bottom > tallest) tallest = bottom
    }
    if (result.height[parentIdx] === 0) result.height[parentIdx] = tallest + padding * 2
  } finally {
    releaseGridScratch(scratch)
  }
}
