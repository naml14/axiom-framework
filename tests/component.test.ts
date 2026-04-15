import { describe, test, expect } from 'bun:test'
import { defineComponent } from '../src/render/component.js'
import type { ElementNode, TextNode, FragmentNode } from '../src/core/types.js'

describe('defineComponent', () => {
  test('wraps a function and returns ComponentDefinition with unique _id', () => {
    const fn = () => ({ type: 'text' as const, content: 'hello' })
    const def = defineComponent(fn)

    expect(def._fn).toBe(fn)
    expect(typeof def._id).toBe('symbol')
  })

  test('each component definition has a unique _id', () => {
    const fn = () => ({ type: 'text' as const, content: 'hello' })
    const a = defineComponent(fn)
    const b = defineComponent(fn)

    expect(a._id).not.toBe(b._id)
  })

  test('component with typed props', () => {
    interface Props { title: string; count: number }
    const fn = (props: Props) => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: `${props.title}: ${props.count}` }]
    })
    const def = defineComponent(fn)

    const result = def._fn({ title: 'Test', count: 42 })
    expect(result.type).toBe('element')
    const el = result as ElementNode
    expect(el.tag).toBe('div')
  })

  test('component with no props', () => {
    const fn = () => ({ type: 'text' as const, content: 'no props' })
    const def = defineComponent(fn)

    const result = def._fn()
    expect(result.type).toBe('text')
    const txt = result as TextNode
    expect(txt.content).toBe('no props')
  })

  test('component returning fragment', () => {
    const fn = () => ({
      type: 'fragment' as const,
      children: [
        { type: 'text' as const, content: 'a' },
        { type: 'text' as const, content: 'b' }
      ]
    })
    const def = defineComponent(fn)

    const result = def._fn()
    expect(result.type).toBe('fragment')
    const frag = result as FragmentNode
    expect(frag.children).toHaveLength(2)
  })

  test('component returning element with children', () => {
    const fn = () => ({
      type: 'element' as const,
      tag: 'div',
      classes: ['card'],
      attrs: { 'data-id': '1' },
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    })
    const def = defineComponent(fn)

    const result = def._fn()
    expect(result.type).toBe('element')
    const el = result as ElementNode
    expect(el.tag).toBe('div')
    expect(el.classes).toEqual(['card'])
    expect(el.attrs).toEqual({ 'data-id': '1' })
    expect(el.children).toHaveLength(1)
  })

  test('acepta displayName explícito sin romper _fn', () => {
    const fn = () => ({ type: 'text' as const, content: 'named' })
    const def = defineComponent('NamedCard', fn)

    expect(def._fn).toBe(fn)
    expect(def.displayName).toBe('NamedCard')
  })

  test('genera fallback displayName cuando la función es anónima', () => {
    const def = defineComponent(() => ({ type: 'text' as const, content: 'anon' }))
    expect((def.displayName?.length ?? 0) > 0).toBe(true)
  })
})
