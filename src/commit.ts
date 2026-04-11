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
  getOn,
  forEachNode,
  getPreparedChildren,
  getPortalTarget,
} from './prepare.js'

// ============================================================
// Public API
// ============================================================

export interface PortalEntry {
  target: HTMLElement
  nodes: Node[]
}

export interface DOMState {
  domNodes: Array<HTMLElement | Text | null>
  portalRoots: Map<number, PortalEntry>  // _index → { target, nodes[] }
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

  while (state.domNodes.length < layout.nodeCount) {
    state.domNodes.push(null)
  }

  buildDOMTree(prepared, layout, root, state)
  fireMountEvents(state.domNodes)
}

export function fireMountEvents(domNodes: Array<HTMLElement | Text | null>): void {
  for (const node of domNodes) {
    if (node instanceof HTMLElement) {
      const listeners = (node as any)._listeners
      if (listeners && listeners.mount) {
        listeners.mount({ type: 'mount', target: node } as unknown as Event)
      }
    }
  }
}

export function fireUnmountEvents(domNodes: Array<HTMLElement | Text | null>): void {
  for (let i = domNodes.length - 1; i >= 0; i--) {
    const node = domNodes[i]
    if (node instanceof HTMLElement) {
      const listeners = (node as any)._listeners
      if (listeners && listeners.unmount) {
        listeners.unmount({ type: 'unmount', target: node } as unknown as Event)
      }
    }
  }
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
      if (node !== null) {
        if (node instanceof HTMLElement) {
          const listeners = (node as any)._listeners
          if (listeners && listeners.unmount) {
            listeners.unmount({ type: 'unmount', target: node } as unknown as Event)
          }
        }
        if (node.parentElement) {
          node.parentElement.removeChild(node)
        }
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

      if (op.newOn !== undefined && el instanceof HTMLElement) {
        const oldListeners = (el as any)._listeners
        if (oldListeners) {
          for (const [evt, listener] of Object.entries(oldListeners)) {
            el.removeEventListener(evt, listener as EventListener)
          }
        }
        for (const [evt, listener] of Object.entries(op.newOn)) {
          el.addEventListener(evt, listener)
        }
        ;(el as any)._listeners = op.newOn
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

  // Phase 3: Inserts — use per-container DocumentFragment for batching
  // This supports portal inserts which target a different container than root.
  const fragments = new Map<HTMLElement, DocumentFragment>()
  for (const op of ops) {
    if (op.type === 'insert') {
      // Portal inserts target a different container — they are CSS-managed, no inline styles applied
      const isPortalChild = op.portalTarget !== undefined && op.portalTarget !== root
      const el = createDOMElement(op, isPortalChild)
      domNodes[op.index] = el
      const container = op.portalTarget ?? root
      let frag = fragments.get(container)
      if (frag === undefined) {
        frag = document.createDocumentFragment()
        fragments.set(container, frag)
      }
      frag.appendChild(el)
    }
  }

  for (const [container, frag] of fragments) {
    if (frag.childNodes.length > 0) {
      container.appendChild(frag)
    }
  }

  // Phase 4: Trigger mount events after DOM insertion
  for (const op of ops) {
    if (op.type === 'insert') {
      const node = domNodes[op.index]
      if (node instanceof HTMLElement) {
        const listeners = (node as any)._listeners
        if (listeners && listeners.mount) {
          listeners.mount({ type: 'mount', target: node } as unknown as Event)
        }
      }
    }
  }
}

// ============================================================
// Internal
// ============================================================

function buildDOMTree(
  prepared: PreparedComponent,
  layout: LayoutResult,
  parent: HTMLElement,
  state: DOMState,
  portalChild = false
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

  if (nodeType === 'portal') {
    // Portal: redirect children to the portalTarget, not the current parent
    const portalTarget = getPortalTarget(prepared)
    if (portalTarget !== undefined) {
      const entry: PortalEntry = { target: portalTarget, nodes: [] }
      state.portalRoots.set(idx, entry)
      for (const child of children) {
        // Capture childNodes count before insertion to track root-level nodes added
        const before = portalTarget.childNodes.length
        // Children of portals are CSS-managed — pass portalChild=true so no inline styles are applied
        buildDOMTree(child, layout, portalTarget, state, true)
        // Collect any new direct children of portalTarget added by this child
        for (let i = before; i < portalTarget.childNodes.length; i++) {
          entry.nodes.push(portalTarget.childNodes[i]!)
        }
      }
    }
    return
  }

  // Element node
  const tag = getTag(prepared) || 'div'
  const el = document.createElement(tag)

  // Apply layout ONLY for framework-managed nodes.
  // Portal children are CSS-managed — no inline position/size applied.
  if (!portalChild) {
    el.style.position = 'absolute'
    const x = layout.x[idx]
    const y = layout.y[idx]
    const w = layout.width[idx]
    const h = layout.height[idx]
    el.style.transform = `translate(${x}px,${y}px)`
    el.style.width = `${w}px`
    el.style.height = `${h}px`
  }

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

  // Apply event listeners
  const on = getOn(prepared)
  if (on !== undefined) {
    for (const [evt, listener] of Object.entries(on)) {
      el.addEventListener(evt, listener)
    }
    (el as any)._listeners = on
  }

  state.domNodes[idx] = el
  parent.appendChild(el)

  // Process children — propagate portalChild flag so descendants also skip inline styles
  for (const child of children) {
    buildDOMTree(child, layout, el, state, portalChild)
  }
}

function createDOMElement(op: DOMOperation, isPortalChild = false): HTMLElement | Text {
  if (op.textContent !== undefined && op.tag === undefined) {
    return document.createTextNode(op.textContent)
  }

  const tag = op.tag || 'div'
  const el = document.createElement(tag)

  // Apply layout ONLY for framework-managed nodes.
  // Portal children (isPortalChild=true) are CSS-managed — no inline styles.
  if (!isPortalChild) {
    el.style.position = 'absolute'
    if (op.x !== undefined) {
      el.style.transform = `translate(${op.x}px,${op.y}px)`
    }
    if (op.width !== undefined) {
      el.style.width = `${op.width}px`
      el.style.height = `${op.height}px`
    }
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

  if (op.on !== undefined) {
    for (const [evt, listener] of Object.entries(op.on)) {
      el.addEventListener(evt, listener)
    }
    (el as any)._listeners = op.on
  }

  return el
}
