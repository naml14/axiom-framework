// ============================================================
// src/syntax/layout.ts — Layout DSL: stack, vstack, row, grid, box
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// Estos helpers combinan nodo + layout en una sola llamada.
// Son la forma idiomática de estructurar interfaces en Axiom.
// Todos producen el mismo ElementNode que h() — cero overhead adicional.
// ============================================================

import { h } from './h.js'
import type { HProps, HChild } from './types.js'
import type { LayoutProps, ElementNode } from '../core/types.js'

// ─── Tipos de layout helpers ─────────────────────────────────────────────────

// StackProps: igual que HProps pero sin 'flex' (siempre es 'column' en stack/vstack)
export type StackProps = Omit<HProps, 'flex'> & { tag?: string }

// RowProps: igual que HProps pero sin 'flex' (siempre es 'row')
export type RowProps = Omit<HProps, 'flex'> & { tag?: string }

// GridProps: sin 'flex' ni 'layout' (el grid genera su propio layout base)
export type GridProps = Omit<HProps, 'flex' | 'layout'> & {
  columnGap?: number
  rowGap?:    number
  tag?:       string
}

// ─── stack() — columna flex ───────────────────────────────────────────────────
// flex: 'column' se inyecta automáticamente.
// El tag puede personalizarse via props.tag (default: 'div').
export function stack(props?: StackProps | null, ...children: HChild[]): ElementNode {
  const { tag = 'div', ...rest } = (props ?? {}) as StackProps
  return h(tag, { ...(rest as HProps), flex: 'column' }, ...children)
}

// ─── vstack — alias de stack (C8: reemplaza col) ─────────────────────────────
// <col> es un elemento HTML nativo para tablas — usar ese nombre generaría
// colisiones silenciosas con <colgroup><col></colgroup>.
// vstack es explícito y sin ambigüedad.
export const vstack = stack

// ─── row() — fila flex ───────────────────────────────────────────────────────
export function row(props?: RowProps | null, ...children: HChild[]): ElementNode {
  const { tag = 'div', ...rest } = (props ?? {}) as RowProps
  return h(tag, { ...(rest as HProps), flex: 'row' }, ...children)
}

// ─── grid() — grid CSS (C7: fusiona layout del usuario) ──────────────────────
// El layout base del grid (display: grid, gridTemplateColumns) se fusiona
// con cualquier layout explícito del usuario — no se descarta.
export function grid(
  columns: number | string,
  props?: GridProps | null,
  ...children: HChild[]
): ElementNode {
  const gridTemplateColumns = typeof columns === 'number'
    ? `repeat(${columns}, 1fr)` as const
    : columns as `repeat(${number}, 1fr)`

  const { tag = 'div', columnGap, rowGap, gap, padding, ...rest } = (props ?? {}) as GridProps & { tag?: string }

  // Layout base del grid
  const gridLayout: LayoutProps = {
    display:             'grid',
    gridTemplateColumns,
    ...(gap      !== undefined && { gap }),
    ...(padding  !== undefined && { padding }),
    ...(columnGap !== undefined && { columnGap }),
    ...(rowGap    !== undefined && { rowGap }),
  }

  // Fusionar con layout explícito del usuario (C7)
  // El usuario puede pasar layout: { rowGap: 24 } sin perder gridTemplateColumns
  const userLayout = (rest as HProps).layout ?? {}
  const mergedLayout: LayoutProps = { ...gridLayout, ...userLayout }

  const finalProps: HProps = { ...(rest as HProps), layout: mergedLayout }

  return h(tag, finalProps, ...children)
}

// ─── box() — azúcar semántica opcional sobre h() (C18) ───────────────────────
// Produce exactamente el mismo output que h().
// Valor: comunica intención de "contenedor semántico" al lector del código.
// Si el equipo prefiere h() directamente, box() puede no usarse — ambos son válidos.
export function box(tag: string, props?: HProps | null, ...children: HChild[]): ElementNode
export function box(props?: HProps | null, ...children: HChild[]): ElementNode
export function box(
  tagOrProps?: string | HProps | null,
  ...rest: unknown[]
): ElementNode {
  if (typeof tagOrProps === 'string') {
    const [props, ...children] = rest as [HProps | null | undefined, ...HChild[]]
    return h(tagOrProps, props ?? null, ...children)
  }
  const [firstChild, ...otherChildren] = rest as HChild[]
  return h('div', tagOrProps as HProps | null, firstChild, ...otherChildren)
}
