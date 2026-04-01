import type { ComponentDefinition, ComponentNode } from './types.js'

export function defineComponent<Props = void>(
  fn: (props: Props) => ComponentNode
): ComponentDefinition<Props> & ((props: Props) => ComponentNode) {
  // Make it callable: Card({ title, body }) returns the ComponentNode directly.
  // This allows using components inline in children arrays without calling ._fn().
  const callable = (props: Props): ComponentNode => fn(props)
  callable._id = Symbol('axiom-component')
  callable._fn = fn
  return callable as unknown as ComponentDefinition<Props> & ((props: Props) => ComponentNode)
}
