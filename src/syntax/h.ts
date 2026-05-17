// ============================================================
// src/syntax/h.ts — h(), t(), fragment() y utilidades internas
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// INVARIANTE: Este módulo no toca src/render/ ni src/app.ts.
// Toda la lógica aquí se resuelve en prepare() o antes.
// El hot path (reflow → commit) nunca ve estas abstracciones.
// ============================================================

import type {
  ComponentNode,
  ElementNode,
  TextNode,
  FragmentNode,
  LayoutProps,
} from '../core/types.js'
import { BOOLEAN_HTML_ATTR_KEYS, HTML_ATTR_DOM_NAMES } from './types.js'
import type { HProps, HChild, ResponsiveMap, LayoutShortcuts } from './types.js'

// ─── Tipo para componentes funcionales JSX ────────────────────────────────────
type PropsOf<C> = C extends (props: infer P) => ComponentNode ? P : never
type RequiredKeys<T> = T extends object
  ? { [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K }[keyof T]
  : never
type ComponentHArgs<C> = [PropsOf<C>] extends [void] | [undefined]
  ? [props?: null | undefined, ...children: HChild[]]
  : RequiredKeys<PropsOf<C>> extends never
    ? [props?: PropsOf<C> | null, ...children: HChild[]]
    : [props: PropsOf<C>, ...children: HChild[]]

// ─── Mapa de eventos sintéticos (C4) ─────────────────────────────────────────
// Eventos cuyo nombre DOM NO es simplemente camelCase → lowercase.
// Sin este mapa: onDoubleClick → "doubleclick" (incorrecto), debe ser "dblclick".
const SYNTHETIC_EVENT_MAP: Readonly<Record<string, string>> = {
  onDoubleClick:   'dblclick',
  onContextMenu:   'contextmenu',
  onMouseEnter:    'mouseenter',
  onMouseLeave:    'mouseleave',
  onTouchStart:    'touchstart',
  onTouchEnd:      'touchend',
  onTouchMove:     'touchmove',
  onPointerDown:   'pointerdown',
  onPointerUp:     'pointerup',
  onPointerMove:   'pointermove',
  onAnimationEnd:  'animationend',
  onTransitionEnd: 'transitionend',
}

// ─── h() ─────────────────────────────────────────────────────────────────────
// Sobrecarga 1: tag string → siempre retorna ElementNode
export function h(tag: string, props?: HProps | null, ...children: HChild[]): ElementNode
// Sobrecarga 2: tag función → retorna ComponentNode (resultado del componente)
export function h<C extends (props: never) => ComponentNode>(tag: C, ...args: ComponentHArgs<C>): ComponentNode
export function h(
  tag: string | ((props: never) => ComponentNode),
  props?: unknown,
  ...children: HChild[]
): ComponentNode {
  // Componente funcional JSX: <Badge label="UI" /> → h(Badge, { label: 'UI' })
  if (typeof tag === 'function') {
    // Para componentes funcionales debemos PRESERVAR la forma original de props.children.
    // Caso crítico: For/Show/Switch aceptan children como función; envolverla en [fn]
    // rompe el contrato y termina en errores tipo "props.children is not a function".
    const mergedProps = children.length > 0
      ? {
          ...(props ?? {}),
          children: children.length === 1 ? children[0] : children,
        }
      : (props ?? {})

    return (tag as (props: unknown) => ComponentNode)(mergedProps)
  }

  // JSX (jsxs/jsx) passes children inside props.children, not as variadic args.
  // When the variadic list is empty, fall back to props.children so both
  // calling conventions produce the same normalized child array.
  const rawChildren: HChild[] =
    children.length > 0
      ? children
      : (props as HProps | null | undefined)?.children !== undefined
        ? Array.isArray((props as HProps).children) ? (props as HProps).children as HChild[] : [(props as HProps).children as HChild]
        : []

  const elementProps = props as HProps | null | undefined

  return {
    type: 'element',
    tag,
    key:      elementProps?.key,
    classes:  normalizeClasses(elementProps?.class),
    attrs:    extractAttrs(elementProps),
    on:       extractHandlers(elementProps),
    layout:   extractLayout(elementProps),
    style:    elementProps?.style,
    children: normalizeChildren(rawChildren),
  }
}

// ─── t() — texto explícito ────────────────────────────────────────────────────
export function t(content: string | number): TextNode {
  return { type: 'text', content: String(content) }
}

// ─── fragment() ──────────────────────────────────────────────────────────────
// Supports both the explicit API: fragment(child1, child2)
// and the JSX Fragment call convention: Fragment({ children: [...] })
export function fragment(
  propsOrChild?: HProps | HChild,
  ...rest: HChild[]
): FragmentNode {
  // JSX calls Fragment({ children: [...] }) — detect by checking if first arg
  // is a plain object with a `children` key and no tag/type signature.
  if (
    propsOrChild !== null &&
    typeof propsOrChild === 'object' &&
    !Array.isArray(propsOrChild) &&
    'children' in propsOrChild &&
    !('type' in propsOrChild)
  ) {
    const { children } = propsOrChild as { children: HChild | HChild[] }
    const raw = Array.isArray(children) ? children : [children]
    return { type: 'fragment', children: normalizeChildren(raw) }
  }
  // Normal variadic call: fragment(child1, child2, ...)
  const raw: HChild[] = propsOrChild !== undefined ? [propsOrChild as HChild, ...rest] : rest
  return { type: 'fragment', children: normalizeChildren(raw) }
}

// ─── normalizeChildren — flatten controlado (C5) ─────────────────────────────
// Recursión explícita en lugar de flat(Infinity).
// Razón: control total del flujo + evitar stack overflow en árboles profundos.
export function normalizeChildren(raw: HChild[]): ComponentNode[] {
  const result: ComponentNode[] = []
  flattenChildren(raw, result)
  return result
}

function flattenChildren(items: HChild[], out: ComponentNode[]): void {
  for (let i = 0; i < items.length; i++) {
    const child = items[i]
    if (child == null || typeof child === 'boolean') continue
    if (Array.isArray(child)) {
      flattenChildren(child, out)
      continue
    }
    if (typeof child === 'string' || typeof child === 'number') {
      out.push(t(child))
      continue
    }
    out.push(child as ComponentNode)
  }
}

// ─── normalizeClasses ─────────────────────────────────────────────────────────
function normalizeClasses(cls: string | string[] | undefined): string[] | undefined {
  if (!cls) return undefined
  if (Array.isArray(cls)) return cls.length > 0 ? cls : undefined
  const parts = cls.split(' ').filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

// ─── extractAttrs — whitelist (C2) ───────────────────────────────────────────
// Solo keys explícitamente en HTML_ATTR_DOM_NAMES se convierten a attrs.
// Props de layout, eventos y class se manejan en sus propios extractores.
function extractAttrs(props: HProps | null | undefined): Record<string, string> | undefined {
  if (!props) return undefined

  const result: Record<string, string> = {}
  const state = { hasAny: false }

  applyKnownAttrs(result, props as Record<string, unknown>, state, false)

  const explicitAttrs = props.attrs
  if (explicitAttrs !== undefined) {
    applyKnownAttrs(result, explicitAttrs as Record<string, unknown>, state, true)
  }

  return state.hasAny ? result : undefined
}

function applyKnownAttrs(
  result: Record<string, string>,
  source: Record<string, unknown>,
  state: { hasAny: boolean },
  allowRawAttrs: boolean
): void {
  for (const key in source) {
    const value = source[key]
    if (value === undefined || value === null) continue

    if (key === 'data' && isPlainAttrBag(value)) {
      applyPrefixedAttrs(result, 'data', value, state)
      continue
    }

    if (key === 'aria' && isPlainAttrBag(value)) {
      applyPrefixedAttrs(result, 'aria', value, state)
      continue
    }

    const domName = (HTML_ATTR_DOM_NAMES as Record<string, string>)[key]
    if (domName !== undefined) {
      applyAttribute(result, domName, key, value, state)
      continue
    }

    if (allowRawAttrs && isScalarAttrValue(value)) {
      applyAttribute(result, key, key, value, state)
    }
  }
}

function applyPrefixedAttrs(
  result: Record<string, string>,
  prefix: 'data' | 'aria',
  values: Record<string, unknown>,
  state: { hasAny: boolean }
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!isScalarAttrValue(value)) continue
    result[`${prefix}-${key}`] = String(value)
    state.hasAny = true
  }
}

function applyAttribute(
  result: Record<string, string>,
  domName: string,
  sourceName: string,
  value: unknown,
  state: { hasAny: boolean }
): void {
  if (typeof value === 'boolean') {
    if (!BOOLEAN_HTML_ATTR_KEYS.has(sourceName)) {
      result[domName] = String(value)
      state.hasAny = true
      return
    }

    if (value) {
      result[domName] = ''
      state.hasAny = true
    }
    return
  }

  if (!isScalarAttrValue(value)) return
  result[domName] = String(value)
  state.hasAny = true
}

function isPlainAttrBag(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isScalarAttrValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

// ─── extractHandlers — con mapa sintético (C4) ───────────────────────────────
function extractHandlers(
  props: HProps | null | undefined
): Record<string, EventListener> | undefined {
  if (!props) return undefined

  const handlers: Record<string, EventListener> = {}
  let hasAny = false

  for (const key in props) {
    if (!isEventProp(key)) continue

    const value = (props as Record<string, unknown>)[key]
    if (typeof value !== 'function') continue

    handlers[toEventName(key)] = value as EventListener
    hasAny = true
  }

  return hasAny ? handlers : undefined
}

function isEventProp(key: string): boolean {
  if (key.length < 3) return false
  if (key[0] !== 'o' || key[1] !== 'n') return false
  const third = key[2]!
  return third === third.toUpperCase() && third !== third.toLowerCase()
}

function toEventName(key: string): string {
  return key in SYNTHETIC_EVENT_MAP
    ? SYNTHETIC_EVENT_MAP[key]!
    : key.slice(2).toLowerCase()
}

// ─── extractLayout — merge determinístico (C1) ───────────────────────────────
// shortcuts + explicit se FUSIONAN. explicit gana en conflicto de key.
// Ejemplo: h('div', { flex: 'column', layout: { gap: 20 } })
//   → layout: { flexDirection: 'column', gap: 20 }   ← ambos aplicados
export function extractLayout(props: HProps | null | undefined): LayoutProps | undefined {
  if (!props) return undefined

  const shortcuts = buildLayoutFromShortcuts(props)
  const explicit  = props.layout

  if (!shortcuts && !explicit) return undefined
  if (!shortcuts) return explicit
  if (!explicit)  return shortcuts

  // Merge: shortcuts como base, explicit como override
  return { ...shortcuts, ...explicit }
}

// ─── buildLayoutFromShortcuts ─────────────────────────────────────────────────
export function buildLayoutFromShortcuts(props: LayoutShortcuts): LayoutProps | undefined {
  const { flex, gap, padding, justify, align, width, height, wrap, at } = props

  if (flex      === undefined && gap      === undefined && padding  === undefined &&
      justify   === undefined && align    === undefined &&
      width     === undefined && height   === undefined &&
      wrap      === undefined && at       === undefined) {
    return undefined
  }

  const layout: LayoutProps = {}
  if (flex    !== undefined) layout.flexDirection  = flex
  if (gap     !== undefined) layout.gap            = gap
  if (padding !== undefined) layout.padding        = padding
  if (justify !== undefined) {
    // El tipo de justifyContent en LayoutProps no incluye 'space-around'
    // pero lo aceptamos en shortcuts como conveniencia — se pasa directo
    layout.justifyContent = justify as LayoutProps['justifyContent']
  }
  if (align   !== undefined) layout.alignItems     = align as LayoutProps['alignItems']
  if (width   !== undefined) layout.width          = width
  if (height  !== undefined) layout.height         = height
  if (wrap    !== undefined) layout.flexWrap        = wrap
  if (at      !== undefined) layout.breakpoints    = resolveAt(at)

  return layout
}

// ─── Breakpoints (C6) ─────────────────────────────────────────────────────────
// `at` es la ÚNICA forma de breakpoints. responsive() eliminado.
//
// Spec: openspec/specs/responsive-breakpoints.md
//
// `at` keys are normalized here into LayoutProps.breakpoints (array of
// { minWidth, layout } entries sorted ascending by minWidth). Matching is
// performed at render time by mergeBreakpointOverrides() in
// src/render/strategy/responsive.ts against the container constraints
// (maxWidth/maxHeight) — NOT against the browser viewport.
//
// Named keys map through BREAKPOINT_PX; numeric string keys are parsed with
// Number(). Entries whose minWidth is not a finite number are discarded.
// Ascending sort ensures the additive cascade in mergeBreakpointOverrides()
// lets the largest matching breakpoint win for conflicting properties.
const BREAKPOINT_PX: Readonly<Record<string, number>> = {
  sm: 480, md: 768, lg: 1024, xl: 1280,
}

function resolveAt(at: ResponsiveMap): LayoutProps['breakpoints'] {
  return Object.entries(at)
    .map(([key, overrides]) => ({
      minWidth: BREAKPOINT_PX[key] ?? Number(key),
      layout:   buildLayoutFromShortcuts(overrides as LayoutShortcuts) ?? {},
    }))
    .filter((breakpoint) => Number.isFinite(breakpoint.minWidth))
    .sort((a, b) => a.minWidth - b.minWidth)
}
