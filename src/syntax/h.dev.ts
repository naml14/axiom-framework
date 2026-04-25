// ============================================================
// src/syntax/h.dev.ts — versión de desarrollo con warnProps() (C12)
// ============================================================
//
// Este módulo se usa SOLO en modo desarrollo.
// En producción, el bundler importará h.ts directamente.
// Tree-shaking elimina completamente este módulo en prod builds.
//
// El guard __DEV__ / __AXIOM_DEV__ permite que bundlers como
// esbuild y Bun hagan dead-code elimination:
//   if (false) { ... }  → eliminado en build de producción
// ============================================================

import { h as hProd } from './h.js'
import type { HProps, HChild } from './types.js'
import type { ComponentNode, ElementNode, LayoutProps } from '../core/types.js'

// ─── Tipo para componentes funcionales JSX ────────────────────────────────────
type FunctionalComponent<P = Record<string, unknown>> = (props: P) => ComponentNode
type ComponentProps = Record<string, unknown> | null | undefined

// Sobrecarga 1: tag string → ElementNode
export function hDev(tag: string, props?: HProps | null, ...children: HChild[]): ElementNode
// Sobrecarga 2: tag función → ComponentNode
export function hDev(tag: FunctionalComponent<any>, props?: ComponentProps, ...children: HChild[]): ComponentNode
export function hDev(
  tag: string | FunctionalComponent,
  props?: HProps | ComponentProps,
  ...children: HChild[]
): ComponentNode {
  // Componentes funcionales: delegar directamente, no hay warnings aplicables
  if (typeof tag === 'function') {
    return hProd(tag, props, ...children)
  }

  if (props) {
    const rawChildren = getRawChildrenForWarnings(props, children)
    warnLayoutConflict(tag, props)
    warnMissingKey(tag, rawChildren)
    warnInvalidFlex(tag, props)
    warnReservedProps(tag, props)
  }
  return hProd(tag, props, ...children)
}

function getRawChildrenForWarnings(
  props: HProps | ComponentProps,
  children: HChild[]
): HChild[] {
  if (children.length > 0) return children

  const propChildren = (props as { children?: HChild | HChild[] | null }).children
  if (propChildren == null) return []
  return Array.isArray(propChildren) ? propChildren : [propChildren]
}

// ─── warnLayoutConflict ───────────────────────────────────────────────────────
// Avisa cuando la misma propiedad tiene valor tanto en shortcuts como en layout.
// Ejemplo: h('div', { gap: 8, layout: { gap: 20 } }) — layout gana, pero es confuso.
function warnLayoutConflict(tag: string, props: HProps): void {
  if (!props.layout) return

  const shortcuts: Array<[keyof HProps, keyof LayoutProps]> = [
    ['flex',    'flexDirection'],
    ['gap',     'gap'],
    ['padding', 'padding'],
    ['justify', 'justifyContent'],
    ['align',   'alignItems'],
    ['width',   'width'],
    ['height',  'height'],
    ['wrap',    'flexWrap'],
  ]

  const conflicts = shortcuts
    .filter(([shortcut, layoutKey]) =>
      props[shortcut] !== undefined && props.layout![layoutKey] !== undefined
    )
    .map(([shortcut]) => shortcut)

  if (conflicts.length > 0) {
    console.warn(
      `[Axiom] <${tag}>: conflicto de layout detectado.\n` +
      `  Las siguientes props tienen valor tanto en shortcuts como en 'layout': [${conflicts.join(', ')}]\n` +
      `  'layout' tiene prioridad en caso de conflicto. Usa uno solo para mayor claridad.`
    )
  }
}

// ─── warnMissingKey ───────────────────────────────────────────────────────────
// Avisa cuando una lista de elementos no tiene keys.
// Se aplica a ul, ol con más de 3 hijos — caso más común de listas sin key.
function warnMissingKey(tag: string, children: HChild[]): void {
  if (tag !== 'ul' && tag !== 'ol') return
  if (children.length <= 3) return

  const hasKeys = children.every(c =>
    c != null &&
    typeof c === 'object' &&
    !Array.isArray(c) &&
    'key' in (c as object)
  )

  if (!hasKeys) {
    console.warn(
      `[Axiom] <${tag}> con ${children.length} hijos sin 'key'.\n` +
      `  Usa key para diff eficiente: h('li', { key: item.id }, ...)`
    )
  }
}

// ─── warnInvalidFlex ─────────────────────────────────────────────────────────
function warnInvalidFlex(tag: string, props: HProps): void {
  if (!props.flex) return
  if (props.flex !== 'row' && props.flex !== 'column') {
    console.warn(
      `[Axiom] <${tag}> flex="${props.flex}" no es válido.\n` +
      `  Solo se permiten 'row' | 'column'.`
    )
  }
}

// ─── warnReservedProps ────────────────────────────────────────────────────────
// 'ref' y 'context' están reservados con tipo 'never' — TypeScript ya
// lo captura en compilación, pero en runtime también avisamos.
function warnReservedProps(tag: string, props: HProps): void {
  if ('ref' in props) {
    console.warn(
      `[Axiom] <${tag}>: 'ref' está reservado para una versión futura y aún no está implementado.\n` +
      `  Elimina 'ref' de las props hasta que esté disponible.`
    )
  }
  if ('context' in props) {
    console.warn(
      `[Axiom] <${tag}>: 'context' está reservado para una versión futura y aún no está implementado.\n` +
      `  Elimina 'context' de las props hasta que esté disponible.`
    )
  }
}
