import { expectTypeOf } from 'expect-type'
import { h, t, fragment } from '../../src/syntax/h.js'
import { defineComponent } from '../../src/render/component.js'
import type { ComponentNode, ElementNode, FragmentNode, TextNode } from '../../src/core/types.js'

const text = t('hello')
expectTypeOf(text).toEqualTypeOf<TextNode>()

const element = h('div', { id: 'root', class: ['app'], onClick: (event) => event.preventDefault() }, 'child')
expectTypeOf(element).toEqualTypeOf<ElementNode>()

const frag = fragment(text, element)
expectTypeOf(frag).toEqualTypeOf<FragmentNode>()

const Card = defineComponent((props: { title: string; count?: number }) => h('article', null, props.title))
const cardNode = h(Card, { title: 'Axiom', count: 1 })
expectTypeOf(cardNode).toExtend<ComponentNode>()

// @ts-expect-error h() must reject unknown props for functional components
h(Card, { title: 'Axiom', unknownProp: true })
// @ts-expect-error h() must require component props
h(Card, {})
// @ts-expect-error string tag props still reject reserved props
h('div', { ref: 'reserved' })
