import type {
  PreparedComponent,
  LayoutResult,
} from './types.js'

import {
  getNodeIndex,
  getNodeType,
  getTag,
  getKey,
  getTextContent,
  getClasses,
  getAttrs,
  forEachNode,
  countNodes,
  getPreparedChildren,
} from './prepare.js'

// ============================================================
// DOM Operation Types
// ============================================================

export interface DOMOperation {
  type: 'insert' | 'remove' | 'update' | 'move'
  index: number
  oldIndex?: number
  // For insert
  tag?: string
  textContent?: string
  classes?: string[]
  attrs?: Record<string, string>
  key?: string
  // For update/move
  x?: number
  y?: number
  width?: number
  height?: number
  newTextContent?: string
}

// ============================================================
// Fast Diff — value changes only
// ============================================================

export function fastDiff(prev: LayoutResult, next: LayoutResult): number[] {
  const changed: number[] = []
  const count = Math.min(prev.nodeCount, next.nodeCount)

  for (let i = 0; i < count; i++) {
    if (prev.x[i] !== next.x[i] ||
        prev.y[i] !== next.y[i] ||
        prev.width[i] !== next.width[i] ||
        prev.height[i] !== next.height[i]) {
      changed.push(i)
    }
  }

  return changed
}

// ============================================================
// Full Diff — shape changes with key reconciliation
// ============================================================

export function fullDiff(
  prevPrepared: PreparedComponent | null,
  prevLayout: LayoutResult | null,
  newPrepared: PreparedComponent,
  newLayout: LayoutResult,
  domNodes: Array<HTMLElement | Text | null>
): DOMOperation[] {
  const ops: DOMOperation[] = []

  // First render — all inserts
  if (prevPrepared === null) {
    forEachNode(newPrepared, (node) => {
      const idx = getNodeIndex(node)
      const op: DOMOperation = { type: 'insert', index: idx }

      const nodeType = getNodeType(node)
      if (nodeType === 'element') {
        op.tag = getTag(node)
        op.classes = getClasses(node)
        op.attrs = getAttrs(node)
        op.key = getKey(node)
      } else if (nodeType === 'text') {
        op.textContent = getTextContent(node)
      }

      ops.push(op)
    })
    return ops
  }

  // Same nodeCount — value change only, use fastDiff + text check
  if (prevLayout !== null && prevLayout.nodeCount === newLayout.nodeCount) {
    const changed = fastDiff(prevLayout, newLayout)

    // Also check for text content changes
    forEachNode(newPrepared, (node) => {
      const idx = getNodeIndex(node)
      if (getNodeType(node) === 'text') {
        const oldNode = findNodeByIndex(prevPrepared, idx)
        const newText = getTextContent(node)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        if (newText !== oldText && !changed.includes(idx)) {
          changed.push(idx)
        }
      }
    })

    for (const idx of changed) {
      const op: DOMOperation = {
        type: 'update',
        index: idx,
        x: newLayout.x[idx],
        y: newLayout.y[idx],
        width: newLayout.width[idx],
        height: newLayout.height[idx],
      }

      // Check text content changes
      const newNode = findNodeByIndex(newPrepared, idx)
      if (newNode && getNodeType(newNode) === 'text') {
        const newText = getTextContent(newNode)
        const oldNode = findNodeByIndex(prevPrepared, idx)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        if (newText !== oldText) {
          op.newTextContent = newText
        }
      }

      ops.push(op)
    }
    return ops
  }

  // Shape change — full diff with key reconciliation
  return fullTreeDiff(prevPrepared, prevLayout, newPrepared, newLayout, domNodes)
}

function fullTreeDiff(
  prevPrepared: PreparedComponent,
  prevLayout: LayoutResult,
  newPrepared: PreparedComponent,
  newLayout: LayoutResult,
  domNodes: Array<HTMLElement | Text | null>
): DOMOperation[] {
  const ops: DOMOperation[] = []

  // Build key maps for reconciliation
  const prevByKey = buildKeyMap(prevPrepared)
  const newByKey = buildKeyMap(newPrepared)

  // Build index sets
  const prevIndices = new Set<number>()
  forEachNode(prevPrepared, (node) => {
    prevIndices.add(getNodeIndex(node))
  })

  const newIndices = new Set<number>()
  forEachNode(newPrepared, (node) => {
    newIndices.add(getNodeIndex(node))
  })

  // Detect removes (old indices not in new tree, not matched by key)
  for (const oldIdx of prevIndices) {
    if (!newIndices.has(oldIdx)) {
      // Check if this node can be matched by key
      const oldNode = findNodeByIndex(prevPrepared, oldIdx)
      const oldKey = oldNode ? getKey(oldNode) : undefined

      if (oldKey === undefined || !newByKey.has(oldKey)) {
        ops.push({ type: 'remove', index: oldIdx, oldIndex: oldIdx })
      }
    }
  }

  // Detect inserts and updates
  forEachNode(newPrepared, (node) => {
    const idx = getNodeIndex(node)
    const nodeType = getNodeType(node)

    if (!prevIndices.has(idx)) {
      // Check if this node can be matched by key to an old node
      const key = getKey(node)
      if (key !== undefined && prevByKey.has(key)) {
        const oldIdx = prevByKey.get(key)!
        if (domNodes[oldIdx]) {
          // Reuse DOM node — it's a move
          ops.push({
            type: 'move',
            index: idx,
            oldIndex: oldIdx,
            x: newLayout.x[idx],
            y: newLayout.y[idx],
            width: newLayout.width[idx],
            height: newLayout.height[idx],
          })
          return
        }
      }

      // True insert
      const op: DOMOperation = { type: 'insert', index: idx }
      if (nodeType === 'element') {
        op.tag = getTag(node)
        op.classes = getClasses(node)
        op.attrs = getAttrs(node)
        op.key = getKey(node)
      } else if (nodeType === 'text') {
        op.textContent = getTextContent(node)
      }
      ops.push(op)
    } else {
      // Same index — check for updates
      const layoutChanged = prevLayout.x[idx] !== newLayout.x[idx] ||
        prevLayout.y[idx] !== newLayout.y[idx] ||
        prevLayout.width[idx] !== newLayout.width[idx] ||
        prevLayout.height[idx] !== newLayout.height[idx]

      let textChanged = false
      let newTextContent: string | undefined
      if (nodeType === 'text') {
        const oldNode = findNodeByIndex(prevPrepared, idx)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        const newText = getTextContent(node)
        if (newText !== oldText) {
          textChanged = true
          newTextContent = newText
        }
      }

      if (layoutChanged || textChanged) {
        const op: DOMOperation = {
          type: 'update',
          index: idx,
        }
        if (layoutChanged) {
          op.x = newLayout.x[idx]
          op.y = newLayout.y[idx]
          op.width = newLayout.width[idx]
          op.height = newLayout.height[idx]
        }
        if (textChanged) {
          op.newTextContent = newTextContent
        }
        ops.push(op)
      }
    }
  })

  // Sort operations: removes → moves → updates → inserts
  const order = { remove: 0, move: 1, update: 2, insert: 3 }
  ops.sort((a, b) => order[a.type] - order[b.type])

  return ops
}

function buildKeyMap(prepared: PreparedComponent): Map<string, number> {
  const map = new Map<string, number>()
  forEachNode(prepared, (node) => {
    const key = getKey(node)
    if (key !== undefined) {
      map.set(key, getNodeIndex(node))
    }
  })
  return map
}

function findNodeByIndex(prepared: PreparedComponent, index: number): PreparedComponent | null {
  let found: PreparedComponent | null = null
  forEachNode(prepared, (node) => {
    if (getNodeIndex(node) === index) {
      found = node
    }
  })
  return found
}
