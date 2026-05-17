import { expectTypeOf } from 'expect-type'
import { defineComponent } from '../../src/render/component.js'
import type { ComponentDefinition, ComponentOptions, ComponentNode } from '../../src/core/types.js'

// --- Overload: defineComponent(fn) ---

const plain = defineComponent(() => ({ type: 'text' as const, content: 'hi' }))
expectTypeOf(plain).toMatchTypeOf<ComponentDefinition<void> & ((props: void) => ComponentNode)>()

// --- Overload: defineComponent(fn, options?) ---

interface CardProps { title: string; count: number }
const withOpts = defineComponent(
  (_props: CardProps) => ({ type: 'text' as const, content: 'card' }),
  { name: 'Card' } satisfies ComponentOptions,
)
expectTypeOf(withOpts).toMatchTypeOf<ComponentDefinition<CardProps> & ((props: CardProps) => ComponentNode)>()

// --- Overload: defineComponent(name, fn) — legacy ---

const legacy = defineComponent('LegacyCard', (_props: CardProps) => ({ type: 'text' as const, content: 'legacy' }))
expectTypeOf(legacy).toMatchTypeOf<ComponentDefinition<CardProps> & ((props: CardProps) => ComponentNode)>()

// --- ComponentOptions is exported ---

const opts: ComponentOptions = { name: 'Explicit' }
expectTypeOf(opts).toEqualTypeOf<ComponentOptions>()

const emptyOpts: ComponentOptions = {}
expectTypeOf(emptyOpts).toEqualTypeOf<ComponentOptions>()

// --- Prop inference is retained ---

const typed = defineComponent((_props: { label: string }) => ({ type: 'text' as const, content: 'x' }))
expectTypeOf(typed._fn).toMatchTypeOf<(props: { label: string }) => ComponentNode>()

const typedWithOptions = defineComponent(
  (_props: { value: number }) => ({ type: 'text' as const, content: 'n' }),
  { name: 'NumberComponent' },
)
expectTypeOf(typedWithOptions._fn).toMatchTypeOf<(props: { value: number }) => ComponentNode>()
