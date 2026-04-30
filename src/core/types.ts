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
  readonly value: T
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
  style?: import('../features/style.js').SafeStyleProps
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
  cssManaged?: boolean
}

export interface ComponentDefinition<Props = void> {
  _id: symbol
  _fn(props: Props): ComponentNode
  displayName?: string
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
  viewportWidth?: number
  viewportHeight?: number
}

export type JustifyContent = 'start' | 'center' | 'end' | 'space-between'
export type AlignItems = 'start' | 'center' | 'end' | 'stretch'
export type FlexDirection = 'row' | 'column'
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse'
export type LayoutDisplay = 'flex' | 'grid'

// Grid MVP subset (Fase 2, slice inicial):
// - número fijo de columnas (N)
// - repeat(N, 1fr)
// - spans mínimos de fila/columna
// Fuera de alcance: areas, minmax(), fr complejos.
export type GridTemplateColumns = number | `repeat(${number}, 1fr)`

export type LayoutUnitValue = `${number}px` | `${number}%` | `${number}vw` | `${number}vh`
export type LayoutDimension = number | LayoutUnitValue

export interface ResponsiveLayoutProps {
  display?: LayoutDisplay
  flexDirection?: FlexDirection
  flexWrap?: FlexWrap
  gap?: number
  gridTemplateColumns?: GridTemplateColumns
  gridColumn?: number
  gridRow?: number
  gridColumnSpan?: number
  gridRowSpan?: number
  columnGap?: number
  rowGap?: number
  justifyContent?: JustifyContent
  alignItems?: AlignItems
  width?: LayoutDimension
  height?: LayoutDimension
  padding?: number
}

export interface LayoutBreakpoint {
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  layout: ResponsiveLayoutProps
}

export interface LayoutProps extends ResponsiveLayoutProps {
  breakpoints?: LayoutBreakpoint[]
}

export interface LayoutResult {
  x: Float32Array
  y: Float32Array
  width: Float32Array
  height: Float32Array
  nodeCount: number
}

// --- Hydration Types (SSR v0.2.7) ---

export interface HydrationOptions {
  strictMismatch?: boolean
  skipMissingPortals?: boolean
  debug?: boolean
}

export interface HydrationResult {
  mismatchCount: number
  hydratedNodeCount: number
  portalCount: number
  warnings: string[]
}

// --- Profiling Types (DX v0.2.7, Fase A) ---

export type ProfilePhase = 'prepare' | 'reflow' | 'commit' | 'total'

export interface ProfileEvent {
  cycle: number
  phase: ProfilePhase
  durationMs: number
}

export type ProfileSubscriber = (event: ProfileEvent) => void

// --- Devtools Hook Types (DX v0.2.7, Fase B) ---

export interface AxiomDevMetrics {
  readonly prepareMs: number
  readonly reflowMs: number
  readonly commitMs: number
}

export interface AxiomDevProfilingMetadata {
  readonly enabled: boolean
  readonly cycle: number
  readonly subscriberCount: number
}

export interface AxiomDevHook {
  readonly version: string
  readonly mounted: boolean
  readonly metrics: AxiomDevMetrics
  readonly profiling: AxiomDevProfilingMetadata
}

declare global {
  interface Window {
    __AXIOM__?: AxiomDevHook
  }

  var __AXIOM_DEV__: boolean | undefined
}
