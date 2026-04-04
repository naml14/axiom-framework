import type {
  ComponentDefinition,
  ComponentNode,
  PreparedComponent,
  ComponentMetrics,
  TextNode,
  ElementNode,
  FragmentNode,
} from './types.js'

// ============================================================
// Pretext integration type
// ============================================================

export interface PretextModule {
  prepare(text: string, font: string): unknown
  layout(prepared: unknown, maxWidth: number, lineHeight: number): { lineCount: number; height: number }
  clearCache(): void
}

export interface PrepareOptions {
  pretext?: PretextModule
  font?: string
}

// ============================================================
// Internal prepared structure
// ============================================================

interface PreparedInternal {
  _index: number
  key?: string
  nodeType: 'element' | 'text' | 'fragment'
  tag?: string
  classes?: string[]
  attrs?: Record<string, string>
  on?: Record<string, EventListener>
  layout?: import('./types.js').LayoutProps
  textContent?: string
  textHandle?: unknown
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
  const node = component._fn(props)
  const prepared = prepareNode(node, options)
  return brandPrepared(prepared)
}

function prepareNode(node: ComponentNode, options?: PrepareOptions): PreparedInternal {
  switch (node.type) {
    case 'text':
      return prepareTextNode(node, options)
    case 'element':
      return prepareElementNode(node, options)
    case 'fragment':
      return prepareFragmentNode(node, options)
  }
}

function prepareTextNode(node: TextNode, options?: PrepareOptions): PreparedInternal {
  const pretext = options?.pretext
  let textHandle: unknown = undefined

  if (pretext !== undefined) {
    textHandle = pretext.prepare(node.content, options?.font ?? '16px sans-serif')
  }

  return {
    _index: allocIndex(),
    nodeType: 'text',
    textContent: node.content,
    textHandle,
    children: [],
    metrics: {
      hasText: true,
      isInline: true,
      simpleLayout: true,
    },
  }
}

function prepareElementNode(node: ElementNode, options?: PrepareOptions): PreparedInternal {
  const index = allocIndex() // Assign index BEFORE processing children

  const children = node.children !== undefined
    ? node.children.flatMap(child => {
        const prepared = prepareNode(child, options)
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
    children,
    metrics: {
      hasText,
      isInline,
      simpleLayout,
    },
  }
}

function prepareFragmentNode(node: FragmentNode, options?: PrepareOptions): PreparedInternal {
  const children = node.children.flatMap(child => {
    const prepared = prepareNode(child, options)
    if (prepared.nodeType === 'fragment') {
      return prepared.children
    }
    return [prepared]
  })

  const hasText = children.some(c => c.metrics.hasText)

  return {
    _index: allocIndex(),
    nodeType: 'fragment',
    children,
    metrics: {
      hasText,
      isInline: false,
      simpleLayout: children.every(c => c.metrics.simpleLayout),
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

export function getNodeType(prepared: PreparedComponent): 'element' | 'text' | 'fragment' {
  return unbrandPrepared(prepared).nodeType
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

export function getTextContent(prepared: PreparedComponent): string | undefined {
  return unbrandPrepared(prepared).textContent
}
