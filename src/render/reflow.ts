import type {
  PreparedComponent,
  LayoutResult,
  LayoutConstraints,
} from '../core/types.js'

import {
  countNodes,
  forEachNode,
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getLayoutProps,
  getTextHandle,
  getTextContent,
  getPortalCssManaged,
} from './prepare.js'

import { measureSimple } from './engines/fast-path.js'
import { measureFlex } from './engines/flex.js'
import { measureGrid } from './engines/grid.js'
import { measureTextChild } from './engines/text-measure.js'
import { resolveResponsiveLayout } from './strategy/responsive.js'
import { acquireLayoutResult } from './pool.js'

// ============================================================
// Public API
// ============================================================

export interface ReflowOptions {
  lineHeight?: number
}

export function createLayoutResult(prepared: PreparedComponent): LayoutResult {
  const count = countNodes(prepared)
  return acquireLayoutResult(count)
}

export function reflow(
  prepared: PreparedComponent,
  constraints: LayoutConstraints,
  options?: ReflowOptions
): LayoutResult {
  const result = createLayoutResult(prepared)
  const lineHeight = options?.lineHeight ?? 20
  // Primary pass: lay out all non-portal nodes. Layout engines (measureSimple, measureFlex,
  // measureGrid) skip portal nodes entirely — portals are invisible to the primary layout tree.
  layoutNode(prepared, constraints, result, lineHeight)
  // Secondary pass: for portals with cssManaged:false, lay out their children so the framework
  // can apply computed inline position/size styles. cssManaged:true portals are skipped here too
  // — CSS owns their layout entirely.
  reflowPortalChildren(prepared, constraints, result, lineHeight)
  return result
}

/**
 * Recursively finds all cssManaged:false portals in the tree and calls
 * layoutNode on each of their children, populating x/y/width/height in result.
 */
function reflowPortalChildren(
  node: PreparedComponent,
  constraints: LayoutConstraints,
  result: LayoutResult,
  lineHeight: number
): void {
  const nodeType = getNodeType(node)
  if (nodeType === 'portal') {
    if (!getPortalCssManaged(node)) {
      for (const child of getPreparedChildren(node)) {
        layoutNode(child, constraints, result, lineHeight)
      }
    }
    // Don't recurse deeper — layoutNode above will handle subtrees of each child
    return
  }
  for (const child of getPreparedChildren(node)) {
    reflowPortalChildren(child, constraints, result, lineHeight)
  }
}

// ============================================================
// Internal
// ============================================================

function layoutNode(
  prepared: PreparedComponent,
  constraints: LayoutConstraints,
  result: LayoutResult,
  lineHeight: number
): void {
  const idx = getNodeIndex(prepared)
  const layout = resolveResponsiveLayout(getLayoutProps(prepared), constraints)
  const nodeType = getNodeType(prepared)
  const children = getPreparedChildren(prepared)

  // Resolve own dimensions
  const ownWidth = layout?.width ?? constraints.maxWidth
  const ownHeight = layout?.height ?? 0
  const padding = layout?.padding ?? 0

  result.width[idx] = ownWidth
  result.height[idx] = ownHeight

  if (children.length === 0) {
    // Leaf node
    if (nodeType === 'text') {
      layoutText(prepared, ownWidth, result, lineHeight)
    }
    return
  }

  // Calculate child constraints — do NOT subtract padding here, let the layout function handle it
  const childMaxWidth = ownWidth
  const childMaxHeight = ownHeight > 0 ? ownHeight : constraints.maxHeight

  // Route to fast path, flex o grid MVP
  const metrics = getMetrics(prepared)
  const hasLayoutProps = layout !== undefined

  if (layout?.display === 'grid') {
    measureGrid(
      prepared,
      childMaxWidth,
      childMaxHeight,
      result,
      lineHeight,
      layout,
      {
        maxWidth: childMaxWidth,
        maxHeight: childMaxHeight,
        viewportWidth: constraints.viewportWidth,
        viewportHeight: constraints.viewportHeight,
      }
    )
  } else if (!hasLayoutProps && metrics.simpleLayout) {
    measureSimple(prepared, childMaxWidth, result, lineHeight)
  } else {
    measureFlex(
      prepared,
      childMaxWidth,
      childMaxHeight,
      result,
      lineHeight,
      layout,
      {
        maxWidth: childMaxWidth,
        maxHeight: childMaxHeight,
        viewportWidth: constraints.viewportWidth,
        viewportHeight: constraints.viewportHeight,
      }
    )
  }

  // Bottom-up: parent height = sum of children heights (column) or max (row)
  // Only calculate if not already set by the layout function (measureFlex/measureSimple)
  if (ownHeight === 0 && result.height[idx] === 0) {
    const flexDirection = layout?.flexDirection ?? 'column'
    if (flexDirection === 'column') {
      let totalHeight = 0
      for (const child of children) {
        const childIdx = getNodeIndex(child)
        totalHeight += result.height[childIdx] ?? 0
      }
      totalHeight += (children.length - 1) * (layout?.gap ?? 0)
      result.height[idx] = totalHeight
    } else {
      let maxHeight = 0
      for (const child of children) {
        const childIdx = getNodeIndex(child)
        const childHeight = result.height[childIdx] ?? 0
        if (childHeight > maxHeight) {
          maxHeight = childHeight
        }
      }
      result.height[idx] = maxHeight
    }
  }
}

function layoutText(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  const idx = getNodeIndex(prepared)
  const textHandle = getTextHandle(prepared)

  // Resolve text content — prefer text engine handle, fallback to raw textContent
  let text: string | undefined
  if (textHandle !== undefined) {
    text = (textHandle as { text: string }).text
  } else {
    text = getTextContent(prepared)
  }

  if (text !== undefined && text.length > 0) {
    const dimensions = measureTextChild(text, { availableWidth, lineHeight }, true)
    result.height[idx] = dimensions.height
    result.width[idx] = dimensions.width
  }
}
