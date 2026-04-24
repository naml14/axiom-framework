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
import type { HProps, HChild, ResponsiveMap, LayoutShortcuts } from './types.js'

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

// ─── Whitelist de attrs HTML conocidos (C2) ───────────────────────────────────
// NOTA: HtmlAttrs en types.ts enumera exactamente estas keys.
// Mantener sincronizado.
const HTML_ATTR_KEYS = new Set<string>([
  'id', 'role', 'href', 'src', 'alt', 'type', 'placeholder', 'name',
  'value', 'target', 'rel', 'action', 'method', 'htmlFor',
  'autoComplete', 'spellCheck', 'pattern',
  'checked', 'selected', 'disabled', 'autoFocus', 'readOnly', 'multiple', 'required',
  'tabIndex', 'rows', 'cols', 'min', 'max', 'step', 'minLength', 'maxLength',
])

// ─── h() ─────────────────────────────────────────────────────────────────────
export function h(
  tag: string,
  props?: HProps | null,
  ...children: HChild[]
): ElementNode {
  return {
    type: 'element',
    tag,
    key:      props?.key,
    classes:  normalizeClasses(props?.class),
    attrs:    extractAttrs(props),
    on:       extractHandlers(props),
    layout:   extractLayout(props),
    style:    props?.style,
    children: normalizeChildren(children),
  }
}

// ─── t() — texto explícito ────────────────────────────────────────────────────
export function t(content: string | number): TextNode {
  return { type: 'text', content: String(content) }
}

// ─── fragment() ──────────────────────────────────────────────────────────────
export function fragment(...children: HChild[]): FragmentNode {
  return { type: 'fragment', children: normalizeChildren(children) }
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
    if (child == null || child === false) continue
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
// Solo keys explícitamente en HTML_ATTR_KEYS se convierten a attrs.
// Props de layout, eventos y class se manejan en sus propios extractores.
function extractAttrs(props: HProps | null | undefined): Record<string, string> | undefined {
  if (!props) return undefined

  const result: Record<string, string> = {}
  let hasAny = false

  for (const key in props) {
    const value = (props as Record<string, unknown>)[key]
    if (value === undefined || value === null) continue

    if (HTML_ATTR_KEYS.has(key)) {
      // htmlFor → for (nombre en DOM)
      result[key === 'htmlFor' ? 'for' : key] = String(value)
      hasAny = true
      continue
    }

    // data-* como objeto { data: { id: '1' } } → data-id="1"
    if (key === 'data' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
        result[`data-${dk}`] = String(dv)
        hasAny = true
      }
      continue
    }

    // aria-* como objeto { aria: { label: 'Cerrar' } } → aria-label="Cerrar"
    if (key === 'aria' && typeof value === 'object') {
      for (const [ak, av] of Object.entries(value as Record<string, unknown>)) {
        result[`aria-${ak}`] = String(av)
        hasAny = true
      }
      continue
    }
  }

  return hasAny ? result : undefined
}

// ─── extractHandlers — con mapa sintético (C4) ───────────────────────────────
function extractHandlers(
  props: HProps | null | undefined
): Record<string, EventListener> | undefined {
  if (!props) return undefined

  const handlers: Record<string, EventListener> = {}
  let hasAny = false

  for (const key in props) {
    // Detectar onXxx: empieza con 'on', tercera letra mayúscula
    if (key.length < 3) continue
    if (key[0] !== 'o' || key[1] !== 'n') continue
    const third = key[2]!
    if (third !== third.toUpperCase() || third === third.toLowerCase()) continue

    const value = (props as Record<string, unknown>)[key]
    if (typeof value !== 'function') continue

    // Mapa sintético primero (onDoubleClick → dblclick)
    // Para el resto: onKeyDown → keydown (todo lowercase del nombre completo sin 'on')
    const eventName = key in SYNTHETIC_EVENT_MAP
      ? SYNTHETIC_EVENT_MAP[key]!
      : key.slice(2).toLowerCase()  // onClick → click, onKeyDown → keydown

    handlers[eventName] = value as EventListener
    hasAny = true
  }

  return hasAny ? handlers : undefined
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
const BREAKPOINT_PX: Readonly<Record<string, number>> = {
  sm: 480, md: 768, lg: 1024, xl: 1280,
}

function resolveAt(at: ResponsiveMap): LayoutProps['breakpoints'] {
  return Object.entries(at).map(([key, overrides]) => ({
    minWidth: BREAKPOINT_PX[key] ?? Number(key),
    layout:   buildLayoutFromShortcuts(overrides as LayoutShortcuts) ?? {},
  }))
}
