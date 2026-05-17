import type {
  PreparedComponent,
  LayoutResult,
  HydrationOptions,
  HydrationResult,
  CommitOptions,
} from '../core/types.js'

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
  getStyle,
  forEachNode,
  getPreparedChildren,
  getPortalTarget,
  getPortalCssManaged,
} from './prepare.js'

// ARCHITECTURAL EXCEPTION: render/ → features/style allowed
// Reason: commit phase applies managed CSS. Decoupling requires
// functional refactoring (strategy pattern or callback injection).
import { applyStyleToElement } from '../features/style.js'

// Security: attribute sanitization for XSS prevention
import { sanitizeAttrs } from '../core/attrs.js'

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

const MANAGED_STYLE_KEYS_PROP = '__axiomManagedStyleKeys' as const

/** Private symbol tracking the last transform string written by Axiom. */
const AXIOM_TRANSFORM_OWNED: unique symbol = Symbol('axiomTransformOwned')

interface AxiomDOMElement extends HTMLElement {
  _listeners?: Record<string, EventListener>
  [MANAGED_STYLE_KEYS_PROP]?: string[]
  [AXIOM_TRANSFORM_OWNED]?: string
}

export function commitFull(
  layout: LayoutResult,
  prepared: PreparedComponent,
  root: HTMLElement,
  state: DOMState,
  opts?: CommitOptions
): void {
  // Setup root container
  root.style.position = 'relative'
  // Apply computed height to root so content is visible
  const rootIdx = 0
  const rootHeight = layout.height[rootIdx] ?? 0
  root.style.height = `${rootHeight}px`

  while (state.domNodes.length < layout.nodeCount) {
    state.domNodes.push(null)
  }

  buildDOMTree(prepared, layout, root, state, false, opts)
  fireMountEvents(state.domNodes)
}

export function commitHydrate(
  layout: LayoutResult,
  prepared: PreparedComponent,
  root: HTMLElement,
  state: DOMState,
  options?: HydrationOptions,
  commitOpts?: CommitOptions
): HydrationResult {
  const result: HydrationResult = {
    mismatchCount: 0,
    hydratedNodeCount: 0,
    portalCount: 0,
    warnings: [],
  }

  const strict = options?.strictMismatch === true
  const byMarker = new Map<number, HTMLElement>()
  const allElements = Array.from(root.getElementsByTagName('*')) as HTMLElement[]
  for (const node of allElements) {
    const raw = node.getAttribute('data-axiom-id')
    if (raw === null) continue
    const idx = Number.parseInt(raw, 10)
    if (!Number.isNaN(idx)) byMarker.set(idx, node)
  }

  if (byMarker.size === 0) {
    const preparedElementIndices: number[] = []
    forEachNode(prepared, (node) => {
      if (getPortalTarget(node) != null) return
      if (getNodeType(node) === 'element') {
        preparedElementIndices.push(getNodeIndex(node))
      }
    })

    const limit = Math.min(preparedElementIndices.length, allElements.length)
    for (let i = 0; i < limit; i++) {
      byMarker.set(preparedElementIndices[i]!, allElements[i]!)
    }
  }

  const nextDomNodes: Array<HTMLElement | Text | null> = []
  const textCursorByParent = new WeakMap<HTMLElement, number>()

  const fail = (message: string): void => {
    result.mismatchCount++
    result.warnings.push(message)
    if (strict) throw new Error(message)
  }

  const hydrateNode = (node: PreparedComponent, parentEl?: HTMLElement): void => {
    const idx = getNodeIndex(node)
    const type = getNodeType(node)

    if (type === 'fragment') {
      const children = getPreparedChildren(node)
      for (const child of children) hydrateNode(child, parentEl)
      return
    }

    if (type === 'text') {
      if (parentEl === undefined) {
        fail(`Text node without parent context at index ${idx}`)
        return
      }

      const start = textCursorByParent.get(parentEl) ?? 0
      let found = -1
      for (let i = start; i < parentEl.childNodes.length; i++) {
        if (parentEl.childNodes[i] instanceof Text) {
          found = i
          break
        }
      }

      if (found === -1) {
        fail(`Hydration text node missing for index ${idx}`)
        return
      }

      const textNode = parentEl.childNodes[found]
      textCursorByParent.set(parentEl, found + 1)
      if (textNode instanceof Text) {
        nextDomNodes[idx] = textNode
        result.hydratedNodeCount++
        const expectedText = getTextContent(node) ?? ''
        const actualText = textNode.nodeValue ?? ''
        if (actualText !== expectedText) {
          fail(`Text mismatch at index ${idx}: expected "${expectedText}" got "${actualText}"`)
        }
      }
      return
    }

    const domEl = byMarker.get(idx)
    if (domEl === undefined) {
      fail(`Hydration marker missing for index ${idx}`)
      return
    }

    const expectedTag = type === 'portal' ? 'div' : (getTag(node) ?? 'div')
    const actualTag = domEl.tagName.toLowerCase()
    if (actualTag !== expectedTag.toLowerCase()) {
      fail(`Tag mismatch at index ${idx}: expected <${expectedTag}> got <${actualTag}>`)
    }

    nextDomNodes[idx] = domEl
    result.hydratedNodeCount++

    if (type === 'portal') {
      const target = getPortalTarget(node)
      if (target === undefined || !target.isConnected) {
        const msg = `Portal target missing for index ${idx}`
        if (options?.skipMissingPortals === false) {
          fail(msg)
        } else {
          result.warnings.push(msg)
        }
      } else {
        state.portalRoots.set(idx, {
          target,
          nodes: Array.from(target.childNodes),
        })
        result.portalCount++
      }
      return
    }

    // Apply framework layout resets first (same as commitFull).
    // This ensures box-model resets are present even when hydrating SSR HTML.
    applyFrameworkLayout(domEl, {
      x: layout.x[idx], y: layout.y[idx],
      width: layout.width[idx], height: layout.height[idx],
    }, true, commitOpts)

    // Sanitize and apply user attributes, but merge style instead of replacing.
    // Replacing domEl.style would wipe out the layout resets applied above.
    const userAttrs = getAttrs(node)
    const userStyle = userAttrs?.style
    const attrsWithoutStyle = userAttrs
      ? Object.fromEntries(Object.entries(userAttrs).filter(([k]) => k !== 'style'))
      : undefined
    sanitizeHydratedElementAttrs(domEl, attrsWithoutStyle)
    // Merge user inline style on top of existing layout styles
    if (typeof userStyle === 'string' && userStyle.length > 0) {
      const existing = domEl.getAttribute('style') ?? ''
      const merged = existing.endsWith(';') || existing.length === 0
        ? `${existing}${userStyle}`
        : `${existing};${userStyle}`
      domEl.setAttribute('style', merged)
    }

    const listeners = getOn(node)
    if (listeners !== undefined) {
      const oldListeners = (domEl as AxiomDOMElement)._listeners as Record<string, EventListener> | undefined
      if (oldListeners !== undefined) {
        for (const [evt, listener] of Object.entries(oldListeners)) {
          domEl.removeEventListener(evt, listener)
        }
      }
      for (const [evt, listener] of Object.entries(listeners)) {
        domEl.addEventListener(evt, listener)
      }
      ;(domEl as AxiomDOMElement)._listeners = listeners
    }

    const children = getPreparedChildren(node)
    if (children.length === 1 && getNodeType(children[0]!) === 'text') {
      const expectedText = getTextContent(children[0]!) ?? ''
      const actualText = domEl.textContent ?? ''
      if (actualText !== expectedText) {
        fail(`Text mismatch at index ${idx}: expected "${expectedText}" got "${actualText}"`)
      }
    }

    const elementChildren = children.filter(child => {
      const childType = getNodeType(child)
      return childType === 'element' || childType === 'portal'
    })
    const actualChildCount = domEl.children.length
    if (actualChildCount !== elementChildren.length) {
      fail(`Children count mismatch at index ${idx}: expected ${elementChildren.length} got ${actualChildCount}`)
    }

    for (const child of children) hydrateNode(child, domEl)
  }

  // Root invariants from commitFull
  root.style.position = 'relative'
  const rootHeight = layout.height[0] ?? 0
  root.style.height = `${rootHeight}px`

  hydrateNode(prepared)

  state.domNodes = nextDomNodes

  if (options?.debug === true) {
    ;(globalThis as any).__AXIOM_HYDRATION_DEBUG__ = {
      mismatchCount: result.mismatchCount,
      hydratedNodeCount: result.hydratedNodeCount,
      portalCount: result.portalCount,
      warnings: [...result.warnings],
      timestamp: Date.now(),
    }
  }

  return result
}

export function fireMountEvents(domNodes: Array<HTMLElement | Text | null>): void {
  for (const node of domNodes) {
    if (node instanceof HTMLElement) {
      const listeners = (node as AxiomDOMElement)._listeners
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
      const listeners = (node as AxiomDOMElement)._listeners
      if (listeners && listeners.unmount) {
        listeners.unmount({ type: 'unmount', target: node } as unknown as Event)
      }
    }
  }
}

export function applyOps(
  ops: DOMOperation[],
  root: HTMLElement,
  domNodes: Array<HTMLElement | Text | null>,
  opts?: CommitOptions
): void {
  // Phase 1: Removes — free up DOM nodes
  for (const op of ops) {
    if (op.type === 'remove') {
      const node = domNodes[op.index]
      if (node !== null && node !== undefined) {
        if (node instanceof HTMLElement) {
          const listeners = (node as AxiomDOMElement)._listeners
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
      if (el === null || el === undefined) continue

      // Only apply layout to framework-managed nodes — skip portal children.
      if (op.x !== undefined && el instanceof HTMLElement) {
        applyFrameworkLayout(el, { x: op.x, y: op.y, width: op.width, height: op.height }, isFrameworkManagedPortalOp(op), opts)
      }

      if (op.newTextContent !== undefined && el instanceof Text) {
        el.nodeValue = op.newTextContent
      }

      if (op.newOn !== undefined && el instanceof HTMLElement) {
        const oldListeners = (el as AxiomDOMElement)._listeners
        if (oldListeners) {
          for (const [evt, listener] of Object.entries(oldListeners)) {
            el.removeEventListener(evt, listener as EventListener)
          }
        }
        for (const [evt, listener] of Object.entries(op.newOn)) {
          el.addEventListener(evt, listener)
        }
        ;(el as AxiomDOMElement)._listeners = op.newOn
      }

      if ('newStyle' in op && el instanceof HTMLElement) {
        if (op.newStyle === undefined) {
          clearManagedStyleFromElement(el)
        } else {
          applyManagedStyleToElement(el, op.newStyle)
        }
      }

      if ('newClasses' in op && el instanceof HTMLElement) {
        el.className = (op.newClasses ?? []).join(' ')
      }
    }

    if (op.type === 'move') {
      const oldNode = domNodes[op.oldIndex!]
      if (oldNode === null || oldNode === undefined) continue

      // Update position — skip portal children (CSS-managed)
      if (op.x !== undefined && oldNode instanceof HTMLElement) {
        applyFrameworkLayout(oldNode, { x: op.x, y: op.y, width: op.width, height: op.height }, isFrameworkManagedPortalOp(op), opts)
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
      // Portal inserts: CSS-managed by default (portalTarget set, portalCssManaged not false).
      // When portalCssManaged===false, framework applies layout styles even to portal children.
      const isPortalChild = op.portalTarget !== undefined && op.portalCssManaged !== false
      const el = createDOMElement(op, isPortalChild, opts)
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
        const listeners = (node as AxiomDOMElement)._listeners
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

/**
 * Returns the composed transform string that Axiom writes for layout positioning.
 * Animation libraries must animate `--animation-transform` instead of `transform`.
 */
function composedTransform(x: number, y: number): string {
  return `translate(${x}px,${y}px) var(--animation-transform)`
}

/**
 * Applies Axiom's absolute-position layout styles to an element.
 * Portal children are CSS-managed — this is a no-op when managedByFramework=false.
 *
 * Compose contract: always writes `translate(Xpx, Ypx) var(--animation-transform)`.
 * If the element already carries an inline transform that Axiom did not write (e.g. a
 * conflicting animation), `opts.onTransformConflict` is called synchronously before
 * the overwrite. If the existing transform priority is `important`, the hook fires but
 * the value is NOT overwritten — the user-declared `!important` rule wins.
 */
function applyFrameworkLayout(
  el: HTMLElement,
  layoutInfo: { x?: number; y?: number; width?: number; height?: number },
  managedByFramework: boolean,
  opts?: CommitOptions
): void {
  if (!managedByFramework) return
  el.style.position = 'absolute'
  const { x, y, width, height } = layoutInfo
  if (x !== undefined && y !== undefined) {
    const axiomEl = el as AxiomDOMElement
    const currentTransform = el.style.transform
    const ownedTransform = axiomEl[AXIOM_TRANSFORM_OWNED]

    // Detect conflict: there's a non-empty inline transform that Axiom did not write.
    if (
      opts?.onTransformConflict !== undefined &&
      currentTransform !== '' &&
      currentTransform !== ownedTransform
    ) {
      opts.onTransformConflict(el, currentTransform)
    }

    // Respect `!important` overrides — user intent wins; Axiom does not escalate priority.
    if (el.style.getPropertyPriority('transform') === 'important') {
      // Hook was called above if applicable; we do not overwrite.
    } else {
      const composed = composedTransform(x, y)
      el.style.transform = composed
      axiomEl[AXIOM_TRANSFORM_OWNED] = composed
    }
  }
  if (width !== undefined && height !== undefined) {
    el.style.width = `${width}px`
    el.style.height = `${height}px`
  }
}

function isFrameworkManagedPortalOp(
  op: { portalTarget?: HTMLElement; portalCssManaged?: boolean }
): boolean {
  return op.portalTarget === undefined || op.portalCssManaged === false
}

function buildDOMTree(
  prepared: PreparedComponent,
  layout: LayoutResult,
  parent: HTMLElement,
  state: DOMState,
  portalChild = false,
  opts?: CommitOptions
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
      buildDOMTree(child, layout, parent, state, portalChild, opts)
    }
    return
  }

  if (nodeType === 'portal') {
    // Portal: redirect children to the portalTarget, not the current parent
    const portalTarget = getPortalTarget(prepared)
    if (portalTarget !== undefined) {
      const entry: PortalEntry = { target: portalTarget, nodes: [] }
      state.portalRoots.set(idx, entry)
      // cssManaged:false → children participate in framework layout (portalChild=false)
      // cssManaged:true (default) → CSS-managed, skip inline styles (portalChild=true)
      const childrenAreCssManaged = getPortalCssManaged(prepared)
      for (const child of children) {
        // Capture childNodes count before insertion to track root-level nodes added
        const before = portalTarget.childNodes.length
        buildDOMTree(child, layout, portalTarget, state, childrenAreCssManaged, opts)
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
  assertValidTagName(tag)
  const el = document.createElement(tag)

  // Add hydration marker for all elements
  el.setAttribute('data-axiom-id', String(idx))

  // Apply layout ONLY for framework-managed nodes.
  // Portal children are CSS-managed — no inline position/size applied.
  applyFrameworkLayout(el, {
    x: layout.x[idx], y: layout.y[idx],
    width: layout.width[idx], height: layout.height[idx],
  }, !portalChild, opts)

  // Apply classes
  const classes = getClasses(prepared)
  if (classes !== undefined && classes.length > 0) {
    el.className = classes.join(' ')
  }

  // Apply attributes (sanitized for security)
  const attrs = sanitizeAttrs(getAttrs(prepared))
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
    (el as AxiomDOMElement)._listeners = on
  }

  // Apply style props (write-only, after layout)
  const style = getStyle(prepared)
  if (style !== undefined) {
    applyManagedStyleToElement(el, style)
  }

  state.domNodes[idx] = el
  parent.appendChild(el)

  // Process children — propagate portalChild flag so descendants also skip inline styles
  for (const child of children) {
    buildDOMTree(child, layout, el, state, portalChild, opts)
  }
}

function createDOMElement(op: import('./diff.js').DOMInsertOp, isPortalChild = false, opts?: CommitOptions): HTMLElement | Text {
  if (op.textContent !== undefined && op.tag === undefined) {
    return document.createTextNode(op.textContent)
  }

  const tag = op.tag || 'div'
  assertValidTagName(tag)
  const el = document.createElement(tag)

  // Apply layout ONLY for framework-managed nodes.
  // Portal children (isPortalChild=true) are CSS-managed — no inline styles.
  applyFrameworkLayout(el, { x: op.x, y: op.y, width: op.width, height: op.height }, !isPortalChild, opts)

  if (op.textContent !== undefined) {
    el.textContent = op.textContent
  }

  if (op.classes !== undefined && op.classes.length > 0) {
    el.className = op.classes.join(' ')
  }

  // Apply attributes (sanitized for security)
  const attrs = sanitizeAttrs(op.attrs)
  if (attrs !== undefined) {
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value)
    }
  }

  if (op.on !== undefined) {
    for (const [evt, listener] of Object.entries(op.on)) {
      el.addEventListener(evt, listener)
    }
    (el as AxiomDOMElement)._listeners = op.on
  }

  // Apply style props (write-only)
  if (op.style !== undefined) {
    applyManagedStyleToElement(el, op.style)
  }

  return el
}

function readElementAttrs(el: Element): Record<string, string> {
  const result: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    result[attr.name] = attr.value
  }
  return result
}

function sanitizeHydratedElementAttrs(
  el: Element,
  preparedAttrs: Record<string, string> | undefined
): void {
  const currentAttrs = readElementAttrs(el)
  const sanitizedCurrent = sanitizeAttrs(currentAttrs) ?? {}

  for (const [key, value] of Object.entries(currentAttrs)) {
    if (!(key in sanitizedCurrent)) {
      el.removeAttribute(key)
      continue
    }

    if (sanitizedCurrent[key] !== value) {
      el.setAttribute(key, sanitizedCurrent[key]!)
    }
  }

  const sanitizedPrepared = sanitizeAttrs(preparedAttrs)
  if (sanitizedPrepared !== undefined) {
    for (const [key, value] of Object.entries(sanitizedPrepared)) {
      el.setAttribute(key, value)
    }
  }
}

function assertValidTagName(tag: string): void {
  if (/\s/.test(tag)) {
    throw new Error(`Invalid tag name: "${tag}"`)
  }
}

function applyManagedStyleToElement(
  el: HTMLElement,
  props: import('../features/style.js').SafeStyleProps
): void {
  applyStyleToElement(el, props)
  ;(el as AxiomDOMElement)[MANAGED_STYLE_KEYS_PROP] = Object.keys(props)
}

function clearManagedStyleFromElement(el: HTMLElement): void {
  const keys = (el as AxiomDOMElement)[MANAGED_STYLE_KEYS_PROP]
  if (!Array.isArray(keys)) return

  for (const key of keys) {
    if (typeof key === 'string') {
      ;(el.style as unknown as Record<string, string>)[key] = ''
    }
  }

  ;(el as AxiomDOMElement)[MANAGED_STYLE_KEYS_PROP] = []
}
