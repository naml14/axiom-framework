import type {
  PreparedComponent,
  LayoutResult,
  LayoutConstraints,
} from './types.js'

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
} from './prepare.js'

// ============================================================
// Internal helpers
// ============================================================

function isPortalNode(prepared: PreparedComponent): boolean {
  return getNodeType(prepared) === 'portal'
}

import { measureSimple } from './fast-path.js'
import { measureFlex } from './flex.js'

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
  layoutNode(prepared, constraints, result, options?.lineHeight ?? 20)
  return result
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
  const layout = getLayoutProps(prepared)
  const nodeType = getNodeType(prepared)
  const children = getPreparedChildren(prepared)

  // Portal nodes: assign 0×0 to the slot (transparent to parent layout),
  // then recurse children using the same parent constraints so they get sized
  // correctly for when they are eventually rendered in the targetElement.
  if (nodeType === 'portal') {
    result.width[idx] = 0
    result.height[idx] = 0
    for (const child of children) {
      layoutNode(child, constraints, result, lineHeight)
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

  // Route to fast path or flex
  const metrics = getMetrics(prepared)
  const hasLayoutProps = layout !== undefined

  if (!hasLayoutProps && metrics.simpleLayout) {
    measureSimple(prepared, childMaxWidth, result, lineHeight)
  } else {
    measureFlex(prepared, childMaxWidth, childMaxHeight, result, lineHeight, layout)
  }

  // Post-process: zero out portal slots and fix sibling y-positions.
  // The layout functions (measureSimple/measureFlex) don't know about portals —
  // they treat portal children like normal block nodes. We correct that here by
  // zeroing the portal slot and re-flowing sibling y-positions excluding portals.
  fixPortalSlots(children, result)

  // Bottom-up: parent height = sum of children heights (column) or max (row)
  // Only calculate if not already set by the layout function (measureFlex/measureSimple)
  if (ownHeight === 0 && result.height[idx] === 0) {
    const flexDirection = layout?.flexDirection ?? 'column'
    if (flexDirection === 'column') {
      let totalHeight = 0
      for (const child of children) {
        const childIdx = getNodeIndex(child)
        totalHeight += result.height[childIdx]
      }
      totalHeight += (children.length - 1) * (layout?.gap ?? 0)
      result.height[idx] = totalHeight
    } else {
      let maxHeight = 0
      for (const child of children) {
        const childIdx = getNodeIndex(child)
        if (result.height[childIdx] > maxHeight) {
          maxHeight = result.height[childIdx]
        }
      }
      result.height[idx] = maxHeight
    }
  }
}

/**
 * After measureSimple/measureFlex runs on a parent, this function zeros out
 * portal child slots and recalculates sibling y-positions so portals are
 * invisible to the layout flow (0×0, no offset contribution).
 *
 * Portal children are still recursed inside layoutChild (via measureSimple),
 * so their OWN children get correct sizes for when they render in targetElement.
 * We only zero the PORTAL SLOT itself, not its children's layout results.
 */
function fixPortalSlots(children: PreparedComponent[], result: LayoutResult): void {
  // Check if any child is a portal — fast-exit for the common case
  const hasPortal = children.some(c => getNodeType(c) === 'portal')
  if (!hasPortal) return

  // Recalculate y-positions for all non-portal siblings, accumulating only
  // the heights of real (non-portal) children.
  let offsetY = 0
  for (const child of children) {
    const childIdx = getNodeIndex(child)
    if (getNodeType(child) === 'portal') {
      // Zero the portal slot — it must not occupy parent space
      result.width[childIdx] = 0
      result.height[childIdx] = 0
      result.x[childIdx] = 0
      result.y[childIdx] = 0
      // Do NOT advance offsetY — portal contributes no space
    } else {
      // Reposition non-portal sibling at the correct (portal-excluded) offset
      result.y[childIdx] = offsetY
      offsetY += result.height[childIdx]
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
