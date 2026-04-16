import type {
  PreparedComponent,
  LayoutResult,
} from '../core/types.js'

import {
  getNodeIndex,
  getNodeType,
  getTag,
  getKey,
  getTextContent,
  getClasses,
  getAttrs,
  getOn,
  getStyle,
  forEachNode,
  countNodes,
  getPreparedChildren,
  getPortalTarget,
  getPortalCssManaged,
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
  on?: Record<string, EventListener>
  style?: import('../features/style.js').SafeStyleProps
  key?: string
  /** When set, this insert targets a portal container instead of the app root */
  portalTarget?: HTMLElement
  /** For portal children with cssManaged:false — framework manages layout styles */
  portalCssManaged?: boolean
  // For update/move
  x?: number
  y?: number
  width?: number
  height?: number
  newTextContent?: string
  newOn?: Record<string, EventListener>
  newStyle?: import('../features/style.js').SafeStyleProps
  newClasses?: string[]
}

// ============================================================
// Portal Map — maps every descendant node index to its portalTarget + cssManaged flag
// ============================================================

interface PortalMapEntry {
  target: HTMLElement
  cssManaged: boolean
}

function buildPortalMap(prepared: PreparedComponent): Map<number, PortalMapEntry> {
  const map = new Map<number, PortalMapEntry>()
  function walk(node: PreparedComponent, currentEntry?: PortalMapEntry): void {
    const nodeType = getNodeType(node)
    if (nodeType === 'portal') {
      const target = getPortalTarget(node)
      if (target !== undefined) {
        const cssManaged = getPortalCssManaged(node)
        const entry: PortalMapEntry = { target, cssManaged }
        for (const child of getPreparedChildren(node)) {
          walk(child, entry)
        }
      }
    } else {
      if (currentEntry !== undefined) {
        map.set(getNodeIndex(node), currentEntry)
      }
      for (const child of getPreparedChildren(node)) {
        walk(child, currentEntry)
      }
    }
  }
  walk(prepared)
  return map
}

// ============================================================
// Class Equality Helper
// ============================================================

function classesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true
  const arrA = a ?? []
  const arrB = b ?? []
  if (arrA.length !== arrB.length) return false
  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) return false
  }
  return true
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
    const portalMap = buildPortalMap(newPrepared)
    forEachNode(newPrepared, (node) => {
      const idx = getNodeIndex(node)
      const op: DOMOperation = { type: 'insert', index: idx }

      const nodeType = getNodeType(node)
      if (nodeType === 'element') {
        op.tag = getTag(node)
        op.classes = getClasses(node)
        op.attrs = getAttrs(node)
        op.on = getOn(node)
        op.style = getStyle(node)
        op.key = getKey(node)
      } else if (nodeType === 'text') {
        op.textContent = getTextContent(node)
      }

      const portalEntry = portalMap.get(idx)
      if (portalEntry !== undefined) {
        op.portalTarget = portalEntry.target
        if (!portalEntry.cssManaged) {
          op.portalCssManaged = false
        }
      }

      ops.push(op)
    })
    return ops
  }

  // Same nodeCount — value change only, use fastDiff + text check
  if (prevLayout !== null && prevLayout.nodeCount === newLayout.nodeCount) {
    const prevByIndex = buildIndexMap(prevPrepared)
    const newByIndex = buildIndexMap(newPrepared)

    const layoutChangedIndices = fastDiff(prevLayout, newLayout)
    const layoutChangedSet = new Set<number>(layoutChangedIndices)
    const allChanged = [...layoutChangedIndices]
    const allChangedSet = new Set<number>(layoutChangedIndices)
    const markChanged = (idx: number): void => {
      if (!allChangedSet.has(idx)) {
        allChangedSet.add(idx)
        allChanged.push(idx)
      }
    }

    // Also check for text content, on, style and class changes
    forEachNode(newPrepared, (node) => {
      const idx = getNodeIndex(node)
      if (getNodeType(node) === 'text') {
        const oldNode = prevByIndex.get(idx)
        const newText = getTextContent(node)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        if (newText !== oldText) {
          markChanged(idx)
        }
      } else if (getNodeType(node) === 'element') {
        const oldNode = prevByIndex.get(idx)
        const newOn = getOn(node)
        const oldOn = oldNode ? getOn(oldNode) : undefined
        if (newOn !== oldOn) {
          markChanged(idx)
        }
        const newStyle = getStyle(node)
        const oldStyle = oldNode ? getStyle(oldNode) : undefined
        if (newStyle !== oldStyle) {
          markChanged(idx)
        }
        const newClasses = getClasses(node)
        const oldClasses = oldNode ? getClasses(oldNode) : undefined
        if (!classesEqual(newClasses, oldClasses)) {
          markChanged(idx)
        }
      }
    })

    allChanged.sort((a, b) => a - b)

    for (const idx of allChanged) {
      const op: DOMOperation = {
        type: 'update',
        index: idx,
      }

      // Emit layout coords ONLY when layout actually changed.
      // Portal CSS-managed children must NOT receive position coords for metadata-only changes
      // (class/text/style/on) — applyFrameworkLayout would stack them all at (0,0).
      if (layoutChangedSet.has(idx)) {
        op.x = newLayout.x[idx]
        op.y = newLayout.y[idx]
        op.width = newLayout.width[idx]
        op.height = newLayout.height[idx]
      }

      // Check text content changes
      const newNode = newByIndex.get(idx)
      const oldNode = prevByIndex.get(idx)
      if (newNode && getNodeType(newNode) === 'text') {
        const newText = getTextContent(newNode)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        if (newText !== oldText) {
          op.newTextContent = newText
        }
      } else if (newNode && getNodeType(newNode) === 'element') {
        const newOn = getOn(newNode)
        const oldOn = oldNode ? getOn(oldNode) : undefined
        if (newOn !== oldOn) {
          op.newOn = newOn
        }
        const newStyle = getStyle(newNode)
        const oldStyle = oldNode ? getStyle(oldNode) : undefined
        if (newStyle !== oldStyle) {
          op.newStyle = newStyle
        }
        const newClasses = getClasses(newNode)
        const oldClasses = oldNode ? getClasses(oldNode) : undefined
        if (!classesEqual(newClasses, oldClasses)) {
          op.newClasses = newClasses
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
  prevLayout: LayoutResult | null,
  newPrepared: PreparedComponent,
  newLayout: LayoutResult,
  domNodes: Array<HTMLElement | Text | null>
): DOMOperation[] {
  const ops: DOMOperation[] = []

  // Build portal map to propagate portalTarget to insert ops
  const portalMap = buildPortalMap(newPrepared)

  // Build key maps for reconciliation
  const prevByKey = buildKeyMap(prevPrepared)
  const newByKey = buildKeyMap(newPrepared)
  const prevByIndex = buildIndexMap(prevPrepared)

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
      const oldNode = prevByIndex.get(oldIdx)
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

          const oldNode = prevByIndex.get(oldIdx)
          if (oldNode !== undefined) {
            const metadataUpdate: DOMOperation = { type: 'update', index: idx }
            let hasMetadataUpdate = false

            if (nodeType === 'text') {
              const oldText = getTextContent(oldNode)
              const newText = getTextContent(node)
              if (newText !== oldText) {
                metadataUpdate.newTextContent = newText
                hasMetadataUpdate = true
              }
            } else if (nodeType === 'element') {
              const oldOn = getOn(oldNode)
              const currentOn = getOn(node)
              if (currentOn !== oldOn) {
                metadataUpdate.newOn = currentOn
                hasMetadataUpdate = true
              }

              const oldStyle = getStyle(oldNode)
              const currentStyle = getStyle(node)
              if (currentStyle !== oldStyle) {
                metadataUpdate.newStyle = currentStyle
                hasMetadataUpdate = true
              }

              const oldClasses = getClasses(oldNode)
              const currentClasses = getClasses(node)
              if (!classesEqual(currentClasses, oldClasses)) {
                metadataUpdate.newClasses = currentClasses
                hasMetadataUpdate = true
              }
            }

            if (hasMetadataUpdate) {
              ops.push(metadataUpdate)
            }
          }
          return
        }
      }

      // True insert
      const op: DOMOperation = { type: 'insert', index: idx }
      if (nodeType === 'element') {
        op.tag = getTag(node)
        op.classes = getClasses(node)
        op.attrs = getAttrs(node)
        op.on = getOn(node)
        op.style = getStyle(node)
        op.key = getKey(node)
      } else if (nodeType === 'text') {
        op.textContent = getTextContent(node)
      }
      const portalEntry = portalMap.get(idx)
      if (portalEntry !== undefined) {
        op.portalTarget = portalEntry.target
        if (!portalEntry.cssManaged) {
          op.portalCssManaged = false
        }
      }
      ops.push(op)
    } else {
      // Same index — check for updates
      const layoutChanged = prevLayout !== null && (
        prevLayout.x[idx] !== newLayout.x[idx] ||
        prevLayout.y[idx] !== newLayout.y[idx] ||
        prevLayout.width[idx] !== newLayout.width[idx] ||
        prevLayout.height[idx] !== newLayout.height[idx]
      )

      let textChanged = false
      let newTextContent: string | undefined
      let onChanged = false
      let newOn: Record<string, EventListener> | undefined
      let styleChanged = false
      let newStyle: import('../features/style.js').SafeStyleProps | undefined
      let classesChanged = false
      let newClassesVal: string[] | undefined

      if (nodeType === 'text') {
        const oldNode = prevByIndex.get(idx)
        const oldText = oldNode ? getTextContent(oldNode) : undefined
        const newText = getTextContent(node)
        if (newText !== oldText) {
          textChanged = true
          newTextContent = newText
        }
      } else if (nodeType === 'element') {
        const oldNode = prevByIndex.get(idx)
        const oldOn = oldNode ? getOn(oldNode) : undefined
        const currentOn = getOn(node)
        if (currentOn !== oldOn) {
          onChanged = true
          newOn = currentOn
        }
        const oldStyle = oldNode ? getStyle(oldNode) : undefined
        const currentStyle = getStyle(node)
        if (currentStyle !== oldStyle) {
          styleChanged = true
          newStyle = currentStyle
        }
        const oldClasses = oldNode ? getClasses(oldNode) : undefined
        const currentClasses = getClasses(node)
        if (!classesEqual(currentClasses, oldClasses)) {
          classesChanged = true
          newClassesVal = currentClasses
        }
      }

      if (layoutChanged || textChanged || onChanged || styleChanged || classesChanged) {
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
        if (onChanged) {
          op.newOn = newOn
        }
        if (styleChanged) {
          op.newStyle = newStyle
        }
        if (classesChanged) {
          op.newClasses = newClassesVal
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

function buildIndexMap(prepared: PreparedComponent): Map<number, PreparedComponent> {
  const map = new Map<number, PreparedComponent>()
  forEachNode(prepared, (node) => {
    map.set(getNodeIndex(node), node)
  })
  return map
}
