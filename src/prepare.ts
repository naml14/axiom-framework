import type {
  ComponentDefinition,
  ComponentNode,
  PreparedComponent,
  ComponentMetrics,
  TextNode,
  ElementNode,
  FragmentNode,
  PortalNode,
} from './types.js'
import { getNodeDebugMeta, invokeComponent, resolveComponentDisplayName } from './component.js'

// ============================================================
// Text layout engine contract
// ============================================================

export interface TextLayoutEngine {
  prepare(text: string, font: string): unknown
  layout(prepared: unknown, maxWidth: number, lineHeight: number): { lineCount: number; height: number }
  clearCache(): void
}

export interface PrepareOptions {
  textEngine?: TextLayoutEngine
  font?: string
}

// ============================================================
// Internal prepared structure
// ============================================================

interface PreparedInternal {
  _index: number
  key?: string
  nodeType: 'element' | 'text' | 'fragment' | 'portal'
  tag?: string
  classes?: string[]
  attrs?: Record<string, string>
  on?: Record<string, EventListener>
  layout?: import('./types.js').LayoutProps
  style?: import('./style.js').SafeStyleProps
  textContent?: string
  textHandle?: unknown
  portalTarget?: HTMLElement
  portalCssManaged?: boolean
  debugDisplayName?: string
  debugRoute?: string
  children: PreparedInternal[]
  metrics: ComponentMetrics
}

let nextIndex = 0

function allocIndex(): number {
  return nextIndex++
}

export function resetIndexCounter(): void {
  nextIndex = 0
}

// ============================================================
// Brand type implementation
// ============================================================

declare const preparedBrand: unique symbol

function brandPrepared(internal: PreparedInternal): PreparedComponent {
  return internal as unknown as PreparedComponent
}

function unbrandPrepared(prepared: PreparedComponent): PreparedInternal {
  return prepared as unknown as PreparedInternal
}

// ============================================================
// Public API
// ============================================================

export function prepare<Props>(
  component: ComponentDefinition<Props>,
  props: Props,
  options?: PrepareOptions
): PreparedComponent {
  resetIndexCounter()
  const node = invokeComponent(component, props)
  const fallbackDisplayName = resolveComponentDisplayName(component as ComponentDefinition<unknown>)
  const prepared = prepareNode(node, options, {
    displayName: fallbackDisplayName,
    route: fallbackDisplayName,
  })
  return brandPrepared(prepared)
}

function prepareNode(
  node: ComponentNode,
  options?: PrepareOptions,
  inheritedDebug?: { displayName: string; route: string }
): PreparedInternal {
  const ownDebug = getNodeDebugMeta(node) ?? inheritedDebug

  switch (node.type) {
    case 'text':
      return prepareTextNode(node, options, ownDebug)
    case 'element':
      return prepareElementNode(node, options, ownDebug)
    case 'fragment':
      return prepareFragmentNode(node, options, ownDebug)
    case 'portal':
      return preparePortalNode(node, options, ownDebug)
  }
}

function prepareTextNode(
  node: TextNode,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const textEngine = options?.textEngine
  let textHandle: unknown = undefined

  if (textEngine !== undefined) {
    textHandle = textEngine.prepare(node.content, options?.font ?? '16px sans-serif')
  }

  return {
    _index: allocIndex(),
    nodeType: 'text',
    textContent: node.content,
    textHandle,
    debugDisplayName: debug?.displayName,
    debugRoute: debug?.route,
    children: [],
    metrics: {
      hasText: true,
      isInline: true,
      simpleLayout: true,
    },
  }
}

function prepareElementNode(
  node: ElementNode,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const index = allocIndex() // Assign index BEFORE processing children

  const children = node.children !== undefined
    ? node.children.flatMap(child => {
        const prepared = prepareNode(child, options, debug)
        // Flatten fragments
        if (prepared.nodeType === 'fragment') {
          return prepared.children
        }
        return [prepared]
      })
    : []

  const hasText = children.some(c => c.metrics.hasText)
  const isInline = isInlineElement(node.tag)
  // FIX from Phase 1: text nodes ARE valid for fast path
  const simpleLayout = children.every(c => c.metrics.simpleLayout)

  return {
    _index: index,
    key: node.key,
    nodeType: 'element',
    tag: node.tag,
    classes: node.classes,
    attrs: node.attrs,
    on: node.on,
    layout: node.layout,
    style: node.style,
    debugDisplayName: debug?.displayName,
    debugRoute: debug?.route,
    children,
    metrics: {
      hasText,
      isInline,
      simpleLayout,
    },
  }
}

function prepareFragmentNode(
  node: FragmentNode,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const children = node.children.flatMap(child => {
    const prepared = prepareNode(child, options, debug)
    if (prepared.nodeType === 'fragment') {
      return prepared.children
    }
    return [prepared]
  })

  const hasText = children.some(c => c.metrics.hasText)

  return {
    _index: allocIndex(),
    nodeType: 'fragment',
    debugDisplayName: debug?.displayName,
    debugRoute: debug?.route,
    children,
    metrics: {
      hasText,
      isInline: false,
      simpleLayout: children.every(c => c.metrics.simpleLayout),
    },
  }
}

function preparePortalNode(
  node: PortalNode,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const index = allocIndex() // Assign portal's index BEFORE processing children

  const children = node.children.flatMap(child => {
    const prepared = prepareNode(child, options, debug)
    if (prepared.nodeType === 'fragment') {
      return prepared.children
    }
    return [prepared]
  })

  const hasText = children.some(c => c.metrics.hasText)

  return {
    _index: index,
    nodeType: 'portal',
    portalTarget: node.target,
    portalCssManaged: node.cssManaged,
    debugDisplayName: debug?.displayName,
    debugRoute: debug?.route,
    children,
    metrics: {
      hasText,
      isInline: false,
      simpleLayout: true,  // Portal slot is 0×0 — always "simple" from parent's perspective
    },
  }
}

// ============================================================
// Helpers
// ============================================================

const INLINE_TAGS = new Set([
  'span', 'a', 'strong', 'em', 'b', 'i', 'u', 'code', 'abbr',
  'small', 'sub', 'sup', 'mark', 'q', 'cite', 'dfn', 'br',
])

function isInlineElement(tag: string): boolean {
  return INLINE_TAGS.has(tag.toLowerCase())
}

// ============================================================
// Public helpers for PreparedComponent
// ============================================================

export function getMetrics(prepared: PreparedComponent): ComponentMetrics {
  return unbrandPrepared(prepared).metrics
}

export function getNodeType(prepared: PreparedComponent): 'element' | 'text' | 'fragment' | 'portal' {
  return unbrandPrepared(prepared).nodeType
}

export function getPortalTarget(prepared: PreparedComponent): HTMLElement | undefined {
  return unbrandPrepared(prepared).portalTarget
}

export function getPortalCssManaged(prepared: PreparedComponent): boolean {
  // cssManaged defaults to true (undefined means CSS-managed)
  return unbrandPrepared(prepared).portalCssManaged !== false
}

export function getTag(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).tag
}

export function getChildren(prepared: PreparedComponent): PreparedComponent[] {
  return unbrandPrepared(prepared).children.map(c => brandPrepared(c))
}

export function getNodeIndex(prepared: PreparedComponent): number {
  return unbrandPrepared(prepared)._index
}

export function countNodes(prepared: PreparedComponent): number {
  const internal = unbrandPrepared(prepared)
  let count = 1
  for (const child of internal.children) {
    count += countNodes(brandPrepared(child))
  }
  return count
}

export function forEachNode(prepared: PreparedComponent, fn: (node: PreparedComponent) => void): void {
  fn(prepared)
  const internal = unbrandPrepared(prepared)
  for (const child of internal.children) {
    forEachNode(brandPrepared(child), fn)
  }
}

export function getLayoutProps(prepared: PreparedComponent): import('./types.js').LayoutProps | undefined {
  return unbrandPrepared(prepared).layout
}

export function getTextHandle(prepared: PreparedComponent): unknown {
  return unbrandPrepared(prepared).textHandle
}

export function getPreparedChildren(prepared: PreparedComponent): PreparedComponent[] {
  return unbrandPrepared(prepared).children.map(c => brandPrepared(c))
}

export function getKey(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).key
}

export function getClasses(prepared: PreparedComponent): string[] | undefined {
  return unbrandPrepared(prepared).classes
}

export function getAttrs(prepared: PreparedComponent): Record<string, string> | undefined {
  return unbrandPrepared(prepared).attrs
}

export function getOn(prepared: PreparedComponent): Record<string, EventListener> | undefined {
  return unbrandPrepared(prepared).on
}

export function getStyle(prepared: PreparedComponent): import('./style.js').SafeStyleProps | undefined {
  return unbrandPrepared(prepared).style
}

export function getTextContent(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).textContent
}

export function getDebugDisplayName(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).debugDisplayName
}

export function getDebugRoute(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).debugRoute
}
