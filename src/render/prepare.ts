import type {
  ComponentDefinition,
  ComponentNode,
  PreparedComponent,
  ComponentMetrics,
  TextNode,
  ElementNode,
  FragmentNode,
  PortalNode,
} from '../core/types.js'
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
  layout?: import('../core/types.js').LayoutProps
  style?: import('../features/style.js').SafeStyleProps
  textContent?: string
  textHandle?: unknown
  portalTarget?: HTMLElement
  portalCssManaged?: boolean
  debugDisplayName?: string
  debugRoute?: string
  children: PreparedInternal[]
  metrics: ComponentMetrics
}

interface PrepareContext {
  nextIndex: number
}

function allocIndex(ctx: PrepareContext): number {
  const index = ctx.nextIndex
  ctx.nextIndex += 1
  return index
}

/**
 * @deprecated Desde v1.0.0 este método es no-op.
 * El índice ahora se aísla por invocación dentro de `prepare()`.
 * Se conserva solo por compatibilidad hacia atrás.
 */
export function resetIndexCounter(): void {
  // Compatibilidad pública:
  // El contador ahora es local por invocación de `prepare`, por lo que
  // ya no existe estado global que reiniciar.
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
  const ctx: PrepareContext = { nextIndex: 0 }
  const node = invokeComponent(component, props)
  const fallbackDisplayName = resolveComponentDisplayName(component as ComponentDefinition<unknown>)
  const prepared = prepareNode(node, ctx, options, {
    displayName: fallbackDisplayName,
    route: fallbackDisplayName,
  })
  return brandPrepared(prepared)
}

function prepareNode(
  node: ComponentNode,
  ctx: PrepareContext,
  options?: PrepareOptions,
  inheritedDebug?: { displayName: string; route: string }
): PreparedInternal {
  const ownDebug = getNodeDebugMeta(node) ?? inheritedDebug

  switch (node.type) {
    case 'text':
      return prepareTextNode(node, ctx, options, ownDebug)
    case 'element':
      return prepareElementNode(node, ctx, options, ownDebug)
    case 'fragment':
      return prepareFragmentNode(node, ctx, options, ownDebug)
    case 'portal':
      return preparePortalNode(node, ctx, options, ownDebug)
  }
}

function prepareTextNode(
  node: TextNode,
  ctx: PrepareContext,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const textEngine = options?.textEngine
  let textHandle: unknown = undefined

  if (textEngine !== undefined) {
    textHandle = textEngine.prepare(node.content, options?.font ?? '16px sans-serif')
  }

  return {
    _index: allocIndex(ctx),
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
  ctx: PrepareContext,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const index = allocIndex(ctx) // Assign index BEFORE processing children

  const children = node.children !== undefined
    ? node.children.flatMap(child => {
        const prepared = prepareNode(child, ctx, options, debug)
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
  ctx: PrepareContext,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const children = node.children.flatMap(child => {
    const prepared = prepareNode(child, ctx, options, debug)
    if (prepared.nodeType === 'fragment') {
      return prepared.children
    }
    return [prepared]
  })

  const hasText = children.some(c => c.metrics.hasText)

  return {
    _index: allocIndex(ctx),
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
  ctx: PrepareContext,
  options?: PrepareOptions,
  debug?: { displayName: string; route: string }
): PreparedInternal {
  const index = allocIndex(ctx) // Assign portal's index BEFORE processing children

  const children = node.children.flatMap(child => {
    const prepared = prepareNode(child, ctx, options, debug)
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

export function getLayoutProps(prepared: PreparedComponent): import('../core/types.js').LayoutProps | undefined {
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

export function getStyle(prepared: PreparedComponent): import('../features/style.js').SafeStyleProps | undefined {
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
