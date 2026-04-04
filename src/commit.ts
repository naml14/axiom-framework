import type {
  PreparedComponent,
  LayoutResult,
} from './types.js'

import type { DOMOperation } from './diff.js'

// Re-export for consumers that import from commit
export type { DOMOperation } from './diff.js'

import {
  getNodeIndex,
  getNodeType,
  getTag,
  getKey,
  getTextContent,
  getClasses,
  getAttrs,
  forEachNode,
  getPreparedChildren,
} from './prepare.js'

// ============================================================
// Public API
// ============================================================

export interface DOMState {
  domNodes: Array<HTMLElement | Text | null>
}

export function commitFull(
  layout: LayoutResult,
  prepared: PreparedComponent,
  root: HTMLElement,
  state: DOMState
): void {
  // Setup root container
  root.style.position = 'relative'
  // Apply computed height to root so content is visible
  const rootIdx = 0
  const rootHeight = layout.height[rootIdx]
  if (rootHeight > 0) {
    root.style.height = `${rootHeight}px`
  }
  // NOTE: do NOT set overflow:hidden — the framework measures and sets explicit
  // heights on containers, but the root itself must let content be visible.

  // Ensure domNodes array is sized correctly
  while (state.domNodes.length < layout.nodeCount) {
    state.domNodes.push(null)
  }

  // Create DOM tree from prepared component
  buildDOMTree(prepared, layout, root, state)
}

export function applyOps(
  ops: DOMOperation[],
  root: HTMLElement,
  domNodes: Array<HTMLElement | Text | null>
): void {
  // Phase 1: Removes — free up DOM nodes
  for (const op of ops) {
    if (op.type === 'remove') {
      const node = domNodes[op.index]
      if (node !== null && node.parentElement) {
        node.parentElement.removeChild(node)
      }
      domNodes[op.index] = null
    }
  }

  // Phase 2: Updates — modify existing nodes in-place
  for (const op of ops) {
    if (op.type === 'update') {
      const el = domNodes[op.index]
      if (el === null) continue

      if (op.x !== undefined && el instanceof HTMLElement) {
        el.style.position = 'absolute'
        el.style.transform = `translate(${op.x}px,${op.y}px)`
        el.style.width = `${op.width}px`
        el.style.height = `${op.height}px`
      }

      if (op.newTextContent !== undefined && el instanceof Text) {
        el.nodeValue = op.newTextContent
      }
    }

    if (op.type === 'move') {
      const oldNode = domNodes[op.oldIndex!]
      if (oldNode === null) continue

      // Update position
      if (op.x !== undefined && oldNode instanceof HTMLElement) {
        oldNode.style.position = 'absolute'
        oldNode.style.transform = `translate(${op.x}px,${op.y}px)`
        oldNode.style.width = `${op.width}px`
        oldNode.style.height = `${op.height}px`
      }

      // Move to new position in domNodes
      domNodes[op.index] = oldNode
      domNodes[op.oldIndex!] = null
    }
  }

  // Phase 3: Inserts — use DocumentFragment for batching
  const fragment = document.createDocumentFragment()
  for (const op of ops) {
    if (op.type === 'insert') {
      const el = createDOMElement(op)
      domNodes[op.index] = el
      fragment.appendChild(el)
    }
  }

  if (fragment.childNodes.length > 0) {
    root.appendChild(fragment)
  }
}

// ============================================================
// Internal
// ============================================================

function buildDOMTree(
  prepared: PreparedComponent,
  layout: LayoutResult,
  parent: HTMLElement,
  state: DOMState
): void {
  const idx = getNodeIndex(prepared)
  const nodeType = getNodeType(prepared)
  const children = getPreparedChildren(prepared)

  if (nodeType === 'text') {
    const textContent = getTextContent(prepared) || ''
    const textNode = document.createTextNode(textContent)
    state.domNodes[idx] = textNode
    parent.appendChild(textNode)
    return
  }

  if (nodeType === 'fragment') {
    // Fragments are transparent — just process children
    for (const child of children) {
      buildDOMTree(child, layout, parent, state)
    }
    return
  }

  // Element node
  const tag = getTag(prepared) || 'div'
  const el = document.createElement(tag)
  el.style.position = 'absolute'

  // Apply layout
  const x = layout.x[idx]
  const y = layout.y[idx]
  const w = layout.width[idx]
  const h = layout.height[idx]
  el.style.transform = `translate(${x}px,${y}px)`
  el.style.width = `${w}px`
  el.style.height = `${h}px`

  // Apply classes
  const classes = getClasses(prepared)
  if (classes !== undefined && classes.length > 0) {
    el.className = classes.join(' ')
  }

  // Apply attributes
  const attrs = getAttrs(prepared)
  if (attrs !== undefined) {
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value)
    }
  }

  state.domNodes[idx] = el
  parent.appendChild(el)

  // Process children
  for (const child of children) {
    buildDOMTree(child, layout, el, state)
  }
}

function createDOMElement(op: DOMOperation): HTMLElement | Text {
  if (op.textContent !== undefined && op.tag === undefined) {
    return document.createTextNode(op.textContent)
  }

  const tag = op.tag || 'div'
  const el = document.createElement(tag)
  el.style.position = 'absolute'

  if (op.x !== undefined) {
    el.style.transform = `translate(${op.x}px,${op.y}px)`
  }
  if (op.width !== undefined) {
    el.style.width = `${op.width}px`
    el.style.height = `${op.height}px`
  }

  if (op.textContent !== undefined) {
    el.textContent = op.textContent
  }

  if (op.classes !== undefined && op.classes.length > 0) {
    el.className = op.classes.join(' ')
  }

  if (op.attrs !== undefined) {
    for (const [key, value] of Object.entries(op.attrs)) {
      el.setAttribute(key, value)
    }
  }

  return el
}
