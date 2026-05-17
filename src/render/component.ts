import type { ComponentDefinition, ComponentNode, ComponentOptions } from '../core/types.js'

const NODE_DEBUG_META = Symbol('axiom-node-debug-meta')

interface NodeDebugMeta {
  displayName: string
  route: string
}

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

/**
 * 32-bit FNV-1a hash of a string, returned as an 8-character lowercase hex string.
 * Used to produce deterministic, human-readable anonymous component names.
 *
 * Note: two component functions whose source text is identical (e.g. due to aggressive
 * minification) will produce the same display name. Use an explicit name in production
 * if disambiguation is required.
 */
function fnv1a32hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // Multiply by FNV prime (0x01000193), kept within 32 bits
    hash = (Math.imul(hash, 0x01000193) >>> 0)
  }
  return hash.toString(16).padStart(8, '0')
}

function resolveComponentDisplayNameInternal(fn: Function, explicit?: string): string {
  const fromExplicit = sanitizeDisplayName(explicit)
  if (fromExplicit !== undefined) return fromExplicit

  const fromFunctionName = sanitizeDisplayName(fn.name)
  if (fromFunctionName !== undefined) return fromFunctionName

  return `Component#${fnv1a32hex(fn.toString())}`
}

export function resolveComponentDisplayName(component: ComponentDefinition<unknown>): string {
  return resolveComponentDisplayNameInternal(component._fn, component.displayName)
}

export function invokeComponent<Props>(
  component: ComponentDefinition<Props>,
  props: Props
): ComponentNode {
  const displayName = resolveComponentDisplayNameInternal(component._fn, component.displayName)
  return invokeComponentInternal(component._fn, displayName, props)
}

function invokeComponentInternal<Props>(
  fn: (props: Props) => ComponentNode,
  displayName: string,
  props: Props
): ComponentNode {
  return withComponentRoute(displayName, () => annotateNodeDebugMeta(fn(props), displayName))
}

function normalizeComponentDefinition<Props>(
  nameOrFn: string | ((props: Props) => ComponentNode),
  maybeFnOrOptions?: ((props: Props) => ComponentNode) | ComponentOptions
): { fn: (props: Props) => ComponentNode; displayName: string } {
  let fn: ((props: Props) => ComponentNode) | undefined
  let explicitDisplayName: string | undefined

  if (typeof nameOrFn === 'string') {
    // Legacy overload: defineComponent('Name', fn)
    explicitDisplayName = nameOrFn
    fn = maybeFnOrOptions as (props: Props) => ComponentNode
  } else {
    // New overload: defineComponent(fn, options?)
    fn = nameOrFn
    if (typeof maybeFnOrOptions === 'object' && maybeFnOrOptions !== null) {
      explicitDisplayName = (maybeFnOrOptions as ComponentOptions).name
    }
  }

  if (!fn) {
    throw new Error('defineComponent requiere una función de componente válida')
  }

  const displayName = resolveComponentDisplayNameInternal(fn, explicitDisplayName)
  return { fn, displayName }
}

export function getNodeDebugMeta(node: ComponentNode): NodeDebugMeta | undefined {
  return (node as unknown as Record<symbol, NodeDebugMeta | undefined>)[NODE_DEBUG_META]
}

export function defineComponent<Props = void>(
  fn: (props: Props) => ComponentNode,
  options?: ComponentOptions,
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)

export function defineComponent<Props = void>(
  displayName: string,
  fn: (props: Props) => ComponentNode,
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)

export function defineComponent<Props = void>(
  nameOrFn: string | ((props: Props) => ComponentNode),
  maybeFnOrOptions?: ((props: Props) => ComponentNode) | ComponentOptions
): ComponentDefinition<Props> & ((props: Props) => ComponentNode) {
  const { fn, displayName } = normalizeComponentDefinition(nameOrFn, maybeFnOrOptions)

  // Make it callable: Card({ title, body }) returns the ComponentNode directly.
  // This allows using components inline in children arrays without calling ._fn().
  const callable = (props: Props): ComponentNode => {
    return invokeComponentInternal(fn, displayName, props)
  }
  callable._id = Symbol('axiom-component')
  callable._fn = fn
  callable.displayName = displayName
  return callable as unknown as ComponentDefinition<Props> & ((props: Props) => ComponentNode)
}
