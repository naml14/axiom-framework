// ============================================================
// src/syntax/flow.ts — For, Show, Switch, Match, Each
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// INVARIANTE CRÍTICO: For, Show, Switch y Each son funciones PURAS.
// NO tienen estado propio, NO se suscriben a señales.
// La reactividad es responsabilidad exclusiva del componente padre.
//
// Cuando `items` cambia, el componente padre se re-ejecuta, For
// reconstruye el fragmento, y prepare() usa las `key` para diff eficiente.
// El DOM se escribe en lote en commit(). La filosofía de Axiom se preserva.
// ============================================================

import type { ComponentNode, FragmentNode } from '../core/types.js'
import { fragment } from './h.js'

// ─── makeEmptyFragment — factoría liviana ────────────────────────────────────
// Se retorna un nuevo objeto en cada llamada para que prepare() pueda
// añadir metadatos debug sin violar Object.freeze().
// El costo es mínimo: un objeto con 2 propiedades.
function makeEmptyFragment() {
  return { type: 'fragment' as const, children: [] as import('../core/types.js').ComponentNode[] }
}

// ─── For — listas (C3: firma corregida) ──────────────────────────────────────
// `each` es SIEMPRE T[]. La señal se desempaqueta en el padre:
//   For({ each: items.value, ... })
//
// Razón: aceptar Signal<T[]> haría de For un componente con suscripción propia,
// rompiendo el modelo donde el COMPONENTE PADRE es la unidad de reactividad.
export function For<T>(props: {
  each: T[]
  key?: (item: T, index: number) => string
  children: (item: T, index: number) => ComponentNode
}): ComponentNode {
  const nodes = props.each.map((item, index) => {
    const node = props.children(item, index)

    if (props.key) {
      const keyValue = props.key(item, index)
      if (node.type === 'element') {
        return { ...node, key: keyValue }
      }
      // Si el hijo es un fragmento, la key no puede inyectarse automáticamente.
      // Dev mode advierte al respecto.
    }

    return node
  })

  return fragment(...nodes)
}

// ─── Show — condicional ───────────────────────────────────────────────────────
export function Show(props: {
  when: boolean
  fallback?: ComponentNode
  children: ComponentNode | (() => ComponentNode)
}): ComponentNode {
  if (props.when) {
    return typeof props.children === 'function'
      ? props.children()
      : props.children
  }
  return props.fallback ?? makeEmptyFragment()
}

// ─── Switch / Match — condicional múltiple ────────────────────────────────────
// SwitchCase es un objeto de datos, no un ComponentNode.
// Switch evalúa los branches en orden y devuelve el primero que match.
export interface SwitchCase {
  readonly _type: 'match'
  readonly when:   boolean
  readonly children: ComponentNode | (() => ComponentNode)
}

export function Match(props: {
  when: boolean
  children: ComponentNode | (() => ComponentNode)
}): SwitchCase {
  return { _type: 'match', when: props.when, children: props.children }
}

export function Switch(props: {
  children: SwitchCase[]
  fallback?: ComponentNode
}): ComponentNode {
  for (const branch of props.children) {
    if (branch.when) {
      return typeof branch.children === 'function'
        ? branch.children()
        : branch.children
    }
  }
  return props.fallback ?? makeEmptyFragment()
}

// ─── Each — alias compacto de For ────────────────────────────────────────────
// Para casos donde la verbosidad de For no se justifica.
// Produce exactamente el mismo output.
export function Each<T>(
  items: T[],
  render: (item: T, index: number) => ComponentNode,
  key?: (item: T) => string
): ComponentNode {
  return For({
    each: items,
    key:  key ? (item, _i) => key(item) : undefined,
    children: render,
  })
}
