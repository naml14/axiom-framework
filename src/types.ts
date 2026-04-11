// ============================================================
// Shared types for Axiom — zero imports, foundation layer
// ============================================================

// --- Signal Types ---

export type SignalKind = 'shape' | 'value'

export interface SignalOptions {
  kind?: SignalKind
}

export interface Signal<T> {
  get value(): T
  set value(v: T)
}

export interface ComputedSignal<T> extends Signal<T> {
  // Computed signals are read-only; setter throws
}

// --- Component Types ---

export type ComponentNode =
  | ElementNode
  | TextNode
  | FragmentNode
  | PortalNode

export interface ElementNode {
  type: 'element'
  tag: string
  key?: string
  classes?: string[]
  attrs?: Record<string, string>
  on?: Record<string, EventListener>
  layout?: LayoutProps
  children?: ComponentNode[]
}

export interface TextNode {
  type: 'text'
  content: string
}

export interface FragmentNode {
  type: 'fragment'
  children: ComponentNode[]
}

export interface PortalNode {
  type: 'portal'
  target: HTMLElement
  children: ComponentNode[]
}

export interface ComponentDefinition<Props = void> {
  _id: symbol
  _fn: (props: Props) => ComponentNode
}

// --- Prepare Types ---

export interface ComponentMetrics {
  hasText: boolean
  isInline: boolean
  simpleLayout: boolean
}

// Brand type — opaque handle, like PreparedText from pretext
declare const preparedBrand: unique symbol

export type PreparedComponent = {
  readonly [preparedBrand]: true
}

// --- Layout Types (Phase 2) ---

export interface LayoutConstraints {
  maxWidth: number
  maxHeight: number
}

export type JustifyContent = 'start' | 'center' | 'end' | 'space-between'
export type AlignItems = 'start' | 'center' | 'end' | 'stretch'
export type FlexDirection = 'row' | 'column'
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse'

export interface LayoutProps {
  flexDirection?: FlexDirection
  flexWrap?: FlexWrap
  gap?: number
  justifyContent?: JustifyContent
  alignItems?: AlignItems
  width?: number
  height?: number
  padding?: number
}

export interface LayoutResult {
  x: Float32Array
  y: Float32Array
  width: Float32Array
  height: Float32Array
  nodeCount: number
}
