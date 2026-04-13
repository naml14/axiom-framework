import type { ComponentDefinition, ComponentNode } from './types.js'

const NODE_DEBUG_META = Symbol('axiom-node-debug-meta')

interface NodeDebugMeta {
  displayName: string
  route: string
}

let nextAnonymousId = 1
const componentRouteStack: string[] = []

function withComponentRoute<T>(displayName: string, run: () => T): T {
  componentRouteStack.push(displayName)
  try {
    return run()
  } finally {
    componentRouteStack.pop()
  }
}

function annotateNodeDebugMeta(node: ComponentNode, displayName: string): ComponentNode {
  if (typeof node !== 'object' || node === null) return node

  const route = componentRouteStack.length > 0
    ? componentRouteStack.join(' > ')
    : displayName

  Object.defineProperty(node, NODE_DEBUG_META, {
    value: Object.freeze({ displayName, route } satisfies NodeDebugMeta),
    enumerable: false,
    configurable: true,
    writable: false,
  })

  return node
}

function sanitizeDisplayName(name: string | undefined): string | undefined {
  const value = name?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}

function resolveComponentDisplayNameInternal(fn: Function, explicit?: string): string {
  const fromExplicit = sanitizeDisplayName(explicit)
  if (fromExplicit !== undefined) return fromExplicit

  const fromFunctionName = sanitizeDisplayName(fn.name)
  if (fromFunctionName !== undefined) return fromFunctionName

  return `Component#${nextAnonymousId++}`
}

export function resolveComponentDisplayName(component: ComponentDefinition<unknown>): string {
  return resolveComponentDisplayNameInternal(component._fn, component.displayName)
}

export function invokeComponent<Props>(
  component: ComponentDefinition<Props>,
  props: Props
): ComponentNode {
  const displayName = resolveComponentDisplayNameInternal(component._fn, component.displayName)
  return withComponentRoute(displayName, () => annotateNodeDebugMeta(component._fn(props), displayName))
}

export function getNodeDebugMeta(node: ComponentNode): NodeDebugMeta | undefined {
  return (node as unknown as Record<symbol, NodeDebugMeta | undefined>)[NODE_DEBUG_META]
}

export function defineComponent<Props = void>(
  fn: (props: Props) => ComponentNode
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)

export function defineComponent<Props = void>(
  displayName: string,
  fn: (props: Props) => ComponentNode
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)

export function defineComponent<Props = void>(
  nameOrFn: string | ((props: Props) => ComponentNode),
  maybeFn?: (props: Props) => ComponentNode
): ComponentDefinition<Props> & ((props: Props) => ComponentNode) {
  const fn = typeof nameOrFn === 'function' ? nameOrFn : maybeFn
  if (fn === undefined) {
    throw new Error('defineComponent requiere una función de componente válida')
  }

  const explicitDisplayName = typeof nameOrFn === 'string' ? nameOrFn : undefined
  const displayName = resolveComponentDisplayNameInternal(fn, explicitDisplayName)

  // Make it callable: Card({ title, body }) returns the ComponentNode directly.
  // This allows using components inline in children arrays without calling ._fn().
  const callable = (props: Props): ComponentNode => {
    return withComponentRoute(displayName, () => annotateNodeDebugMeta(fn(props), displayName))
  }
  callable._id = Symbol('axiom-component')
  callable._fn = fn
  callable.displayName = displayName
  return callable as unknown as ComponentDefinition<Props> & ((props: Props) => ComponentNode)
}
