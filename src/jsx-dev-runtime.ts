// ============================================================
// src/jsx-dev-runtime.ts — Runtime JSX para modo desarrollo
// ============================================================
//
// Incluye validaciones extra via hDev().
// En producción, el bundler usará jsx-runtime.ts directamente.
// ============================================================

import { hDev } from './syntax/h.dev.js'
import { fragment } from './syntax/h.js'
import type { ComponentNode } from './core/types.js'

// ─── Tipo para componentes funcionales JSX ────────────────────────────────────
type PropsOf<C> = C extends (props: infer P) => ComponentNode ? P : never
type ComponentProps = Record<string, unknown> | null | undefined

export const jsx = hDev
export const jsxs = hDev

// Bun/TypeScript en modo desarrollo emiten jsxDEV(type, props, key, isStaticChildren, source, self).
// No podemos reexportar hDev directamente porque esos argumentos extra terminan entrando como
// children variádicos falsos y hacen que props.children se ignore por completo.
export function jsxDEV(tag: string, props?: Record<string, unknown> | null, key?: string, _isStaticChildren?: boolean, _source?: unknown, _self?: unknown): ComponentNode
export function jsxDEV<C extends (props: never) => ComponentNode>(tag: C, props?: PropsOf<C> | null, key?: string, _isStaticChildren?: boolean, _source?: unknown, _self?: unknown): ComponentNode
export function jsxDEV(
	tag: string | ((props: never) => ComponentNode),
	props?: unknown,
	key?: string,
	_isStaticChildren?: boolean,
	_source?: unknown,
	_self?: unknown
): ComponentNode {
	const nextProps = key !== undefined
		? { ...(props ?? {}), key }
		: props

	return typeof tag === 'function'
		? hDev(tag, nextProps as never)
		: hDev(tag, nextProps as Record<string, unknown> | null | undefined)
}

export { fragment as Fragment }
