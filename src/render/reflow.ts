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
import { resolveResponsiveLayout } from './strategy/responsive.js'

// ============================================================
// Public API
// ============================================================

export interface ReflowOptions {
  lineHeight?: number
}

export function createLayoutResult(prepared: PreparedComponent): LayoutResult {
  const count = countNodes(prepared)
  return {
    x: new Float32Array(count),
    y: new Float32Array(count),
    width: new Float32Array(count),
    height: new Float32Array(count),
    nodeCount: count,
  }
}

export function reflow(
  prepared: PreparedComponent,
  constraints: LayoutConstraints,
  options?: ReflowOptions
): LayoutResult {
  const result = createLayoutResult(prepared)
  const lineHeight = options?.lineHeight ?? 20
  layoutNode(prepared, constraints, result, lineHeight)
  // Second pass: portals with cssManaged:false are skipped by measureSimple/measureFlex.
  // We must lay out their children separately so the result arrays are populated.
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

  // Portal nodes: assign 0×0 to the slot (transparent to parent layout).
  // Portal children are CSS-managed by default — the framework inserts them into the DOM
  // but does NOT apply inline position/size styles. CSS owns their layout entirely.
  // When cssManaged:false, the framework lays out children so it can apply inline styles.
  if (nodeType === 'portal') {
    result.width[idx] = 0
    result.height[idx] = 0
    if (!getPortalCssManaged(prepared)) {
      // cssManaged:false: lay out each portal child through the full pipeline.
      // Calling layoutNode directly respects each child's own layout props (width, height, flex…).
      for (const child of children) {
        layoutNode(child, constraints, result, lineHeight)
      }
    }
    return
  }

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
    const charWidth = 6
    const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth))
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine))
    result.height[idx] = lineCount * lineHeight
    result.width[idx] = availableWidth
  }
}
