// ============================================================
// src/syntax/types.ts — Tipos públicos de la capa de sintaxis
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// INVARIANTE: Este archivo no importa NADA de src/render/.
// Puede depender de tipos públicos de features cuando forman parte del contrato
// de autoría (por ejemplo SafeStyleProps), pero no debe importar runtime.
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
// Solo se admiten los atributos declarados en HTML_ATTR_DOM_NAMES.
// data-* y aria-* van como objetos separados { data: {}, aria: {} }.
export const HTML_ATTR_DOM_NAMES = {
  id:           'id',
  role:         'role',
  href:         'href',
  src:          'src',
  alt:          'alt',
  type:         'type',
  placeholder:  'placeholder',
  name:         'name',
  value:        'value',
  checked:      'checked',
  selected:     'selected',
  disabled:     'disabled',
  tabIndex:     'tabindex',
  target:       'target',
  rel:          'rel',
  action:       'action',
  method:       'method',
  htmlFor:      'for',
  autoComplete: 'autocomplete',
  autoFocus:    'autofocus',
  spellCheck:   'spellcheck',
  readOnly:     'readonly',
  multiple:     'multiple',
  rows:         'rows',
  cols:         'cols',
  min:          'min',
  max:          'max',
  step:         'step',
  pattern:      'pattern',
  required:     'required',
  minLength:    'minlength',
  maxLength:    'maxlength',
} as const

const BOOLEAN_HTML_ATTR_KEY_LIST = [
  'checked',
  'selected',
  'disabled',
  'autoFocus',
  'readOnly',
  'multiple',
  'required',
] as const

const NUMBER_HTML_ATTR_KEY_LIST = [
  'tabIndex',
  'rows',
  'cols',
  'minLength',
  'maxLength',
] as const

const STRING_OR_NUMBER_HTML_ATTR_KEY_LIST = [
  'min',
  'max',
  'step',
] as const

export const BOOLEAN_HTML_ATTR_KEYS = new Set<string>(BOOLEAN_HTML_ATTR_KEY_LIST)

export type HtmlAttrKey = keyof typeof HTML_ATTR_DOM_NAMES

type BooleanHtmlAttrKey = (typeof BOOLEAN_HTML_ATTR_KEY_LIST)[number]
type NumberHtmlAttrKey = (typeof NUMBER_HTML_ATTR_KEY_LIST)[number]
type StringOrNumberHtmlAttrKey = (typeof STRING_OR_NUMBER_HTML_ATTR_KEY_LIST)[number]
type StringHtmlAttrKey = Exclude<HtmlAttrKey, BooleanHtmlAttrKey | NumberHtmlAttrKey | StringOrNumberHtmlAttrKey>

type HtmlAttrValueMap =
  & Record<StringHtmlAttrKey, string>
  & Record<BooleanHtmlAttrKey, boolean>
  & Record<NumberHtmlAttrKey, number>
  & Record<StringOrNumberHtmlAttrKey, string | number>

export type HtmlAttrs = Partial<HtmlAttrValueMap> & {
  // Atributos data-* como objeto separado
  data?: Record<string, string>
  // Atributos aria-* como objeto separado
  aria?: Record<string, string | boolean>
}

// ─── Escape hatch explícito para attrs DOM crudos ───────────────────────────
// Permite pasar atributos DOM de forma intencional sin reabrir una index signature
// sobre HProps completa. Se sanitiza más adelante en SSR/commit.
export type ExplicitAttrs = {
  [key: string]: string | number | boolean | Record<string, string> | Record<string, string | boolean> | undefined
  style?: string
  data?: Record<string, string>
  aria?: Record<string, string | boolean>
}

// ─── HProps — tipo principal de la capa de sintaxis (C2: sin index signature) ─
// La ausencia de [attr: string]: unknown es INTENCIONAL.
// Evita que props de layout terminen en attrs del DOM por accidente.
export type HProps = AxiomEventHandlers & LayoutShortcuts & HtmlAttrs & {
  class?:    string | string[]
  attrs?:    ExplicitAttrs
  style?:    SafeStyleProps
  // layout explícito — se FUSIONA con shortcuts, no los reemplaza (C1)
  layout?:   LayoutProps
  key?:      string
  // JSX passes children as a prop when there are multiple children (jsxs)
  children?: HChild | HChild[]
  // Reservado para versiones futuras (C16) — never fuerza error en compilación
  ref?:      never
  context?:  never
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
