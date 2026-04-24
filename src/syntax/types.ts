// ============================================================
// src/syntax/types.ts — Tipos públicos de la capa de sintaxis
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// INVARIANTE: Este archivo no importa NADA de src/render/ ni src/features/.
// Es la capa de tipos pura de la API de autoría.
// ============================================================

import type { LayoutProps, LayoutDimension } from '../core/types.js'
import type { SafeStyleProps } from '../features/style.js'

// ─── Tipos de eventos estrictos (C10) ─────────────────────────────────────────
// EventListener genérico reemplazado por tipos específicos del DOM.
// Beneficio: el IDE autocompleta con el tipo correcto del evento.
export type AxiomEventHandlers = {
  onClick?:          (e: MouseEvent)       => void
  onDoubleClick?:    (e: MouseEvent)       => void
  onMouseDown?:      (e: MouseEvent)       => void
  onMouseUp?:        (e: MouseEvent)       => void
  onMouseOver?:      (e: MouseEvent)       => void
  onMouseOut?:       (e: MouseEvent)       => void
  onMouseEnter?:     (e: MouseEvent)       => void
  onMouseLeave?:     (e: MouseEvent)       => void
  onContextMenu?:    (e: MouseEvent)       => void
  onKeyDown?:        (e: KeyboardEvent)    => void
  onKeyUp?:          (e: KeyboardEvent)    => void
  onKeyPress?:       (e: KeyboardEvent)    => void
  onInput?:          (e: InputEvent)       => void
  onChange?:         (e: Event)            => void
  onFocus?:          (e: FocusEvent)       => void
  onBlur?:           (e: FocusEvent)       => void
  onSubmit?:         (e: SubmitEvent)      => void
  onScroll?:         (e: Event)            => void
  onWheel?:          (e: WheelEvent)       => void
  onTouchStart?:     (e: TouchEvent)       => void
  onTouchEnd?:       (e: TouchEvent)       => void
  onTouchMove?:      (e: TouchEvent)       => void
  onPointerDown?:    (e: PointerEvent)     => void
  onPointerUp?:      (e: PointerEvent)     => void
  onPointerMove?:    (e: PointerEvent)     => void
  onAnimationEnd?:   (e: AnimationEvent)   => void
  onTransitionEnd?:  (e: TransitionEvent)  => void
}

// ─── Shortcuts de layout ──────────────────────────────────────────────────────
// Atajos co-localizados con el nodo. Se fusionan con `layout` explícito en h().
export type LayoutShortcuts = {
  flex?:    'row' | 'column'
  gap?:     number
  padding?: number
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'
  align?:   'start' | 'center' | 'end' | 'stretch' | 'baseline'
  width?:   LayoutDimension
  height?:  LayoutDimension
  wrap?:    'nowrap' | 'wrap' | 'wrap-reverse'
  // Breakpoints — única forma (C6: elimina responsive() duplicado)
  at?:      ResponsiveMap
}

// ─── Atributos HTML — whitelist explícita (C2) ────────────────────────────────
// Solo se admiten los atributos tipados aquí.
// data-* y aria-* van como objetos separados { data: {}, aria: {} }.
export type HtmlAttrs = {
  id?:          string
  role?:        string
  href?:        string
  src?:         string
  alt?:         string
  type?:        string
  placeholder?: string
  name?:        string
  value?:       string
  checked?:     boolean
  selected?:    boolean
  disabled?:    boolean
  tabIndex?:    number
  target?:      string
  rel?:         string
  action?:      string
  method?:      string
  htmlFor?:     string
  autoComplete?: string
  autoFocus?:   boolean
  spellCheck?:  boolean
  readOnly?:    boolean
  multiple?:    boolean
  rows?:        number
  cols?:        number
  min?:         string | number
  max?:         string | number
  step?:        string | number
  pattern?:     string
  required?:    boolean
  minLength?:   number
  maxLength?:   number
  // Atributos data-* como objeto separado
  data?:        Record<string, string>
  // Atributos aria-* como objeto separado
  aria?:        Record<string, string | boolean>
}

// ─── HProps — tipo principal de la capa de sintaxis (C2: sin index signature) ─
// La ausencia de [attr: string]: unknown es INTENCIONAL.
// Evita que props de layout terminen en attrs del DOM por accidente.
export type HProps = AxiomEventHandlers & LayoutShortcuts & HtmlAttrs & {
  class?:   string | string[]
  style?:   SafeStyleProps
  // layout explícito — se FUSIONA con shortcuts, no los reemplaza (C1)
  layout?:  LayoutProps
  key?:     string
  // Reservado para versiones futuras (C16) — never fuerza error en compilación
  ref?:     never
  context?: never
}

// ─── Tipos de children ────────────────────────────────────────────────────────
import type { ComponentNode } from '../core/types.js'
export type HChild = ComponentNode | string | number | boolean | null | undefined | HChild[]

// ─── Breakpoints ──────────────────────────────────────────────────────────────
export type ResponsiveMap = {
  sm?: Partial<LayoutShortcuts>
  md?: Partial<LayoutShortcuts>
  lg?: Partial<LayoutShortcuts>
  xl?: Partial<LayoutShortcuts>
  [minWidth: number]: Partial<LayoutShortcuts>
}
