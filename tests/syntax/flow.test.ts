// ============================================================
// tests/syntax/flow.test.ts — Tests de For, Show, Switch, Match, Each
// ============================================================

import { describe, test, expect } from 'bun:test'
import { For, Show, Switch, Match, Each } from '../../src/syntax/flow.js'
import { h } from '../../src/syntax/h.js'
import type { ComponentNode } from '../../src/core/types.js'

// ─── For ─────────────────────────────────────────────────────────────────────
describe('For()', () => {
  test('mapea lista a FragmentNode', () => {
    const node = For({
      each: [1, 2, 3],
      children: (n) => h('li', null, String(n)),
    })
    expect(node.type).toBe('fragment')
    expect((node as any).children.length).toBe(3)
  })

  test('lista vacía → FragmentNode vacío', () => {
    const node = For({ each: [], children: (x: never) => h('li') })
    expect(node.type).toBe('fragment')
    expect((node as any).children.length).toBe(0)
  })

  test('inyecta key en ElementNode hijo', () => {
    const items = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]
    const node = For({
      each: items,
      keyBy: (item) => item.id,
      children: (item) => h('li', null, item.name),
    })
    const children = (node as any).children as ComponentNode[]
    expect((children[0] as any).key).toBe('a')
    expect((children[1] as any).key).toBe('b')
  })

  test('sin key → no inyecta key en hijos', () => {
    const node = For({
      each: ['x'],
      children: () => h('li'),
    })
    const children = (node as any).children as ComponentNode[]
    expect((children[0] as any).key).toBeUndefined()
  })

  test('recibe índice en la función de render', () => {
    const indices: number[] = []
    For({
      each: ['a', 'b', 'c'],
      children: (_item, index) => {
        indices.push(index)
        return h('li')
      },
    })
    expect(indices).toEqual([0, 1, 2])
  })

  test('children función se preserva al invocar For vía h() como componente funcional', () => {
    const ForComponent = For as unknown as (props: {
      each: string[]
      children: (item: string, index: number) => ComponentNode
    }) => ComponentNode

    const node = h(ForComponent, {
      each: ['Alpha', 'Beta'],
      children: (item: string) => h('li', null, item),
    })

    expect((node as any).type).toBe('fragment')
    expect((node as any).children.length).toBe(2)
    expect(((node as any).children[0] as any).tag).toBe('li')
  })
})

// ─── Show ─────────────────────────────────────────────────────────────────────
describe('Show()', () => {
  test('when: true → devuelve children', () => {
    const child = h('p', null, 'visible')
    const result = Show({ when: true, children: child })
    expect(result).toBe(child)
  })

  test('when: false → devuelve EMPTY_FRAGMENT', () => {
    const result = Show({ when: false, children: h('p') })
    expect(result.type).toBe('fragment')
    expect((result as any).children).toEqual([])
  })

  test('when: false + fallback → devuelve fallback', () => {
    const fallback = h('span', null, 'fallback')
    const result = Show({ when: false, fallback, children: h('p') })
    expect(result).toBe(fallback)
  })

  test('when: true con children como función', () => {
    const child = h('p', null, 'lazy')
    const result = Show({ when: true, children: () => child })
    expect(result).toBe(child)
  })

  test('cuando when: false no evalúa children función', () => {
    let evaluated = false
    Show({
      when: false,
      children: () => {
        evaluated = true
        return h('p')
      },
    })
    // No evalúa porque when es false
    expect(evaluated).toBe(false)
  })
})

// ─── Switch / Match ───────────────────────────────────────────────────────────
describe('Switch() / Match()', () => {
  test('primera coincidencia → devuelve ese children', () => {
    const a = h('p', null, 'A')
    const b = h('p', null, 'B')
    const result = Switch({
      children: [
        Match({ when: false, children: a }),
        Match({ when: true,  children: b }),
      ],
    })
    expect(result).toBe(b)
  })

  test('sin coincidencia + fallback → fallback', () => {
    const fallback = h('p', null, 'nada')
    const result = Switch({
      fallback,
      children: [
        Match({ when: false, children: h('p') }),
      ],
    })
    expect(result).toBe(fallback)
  })

  test('sin coincidencia sin fallback → EMPTY_FRAGMENT', () => {
    const result = Switch({
      children: [Match({ when: false, children: h('p') })],
    })
    expect(result.type).toBe('fragment')
    expect((result as any).children).toEqual([])
  })

  test('evalúa children como función cuando match', () => {
    const child = h('p', null, 'lazy')
    const result = Switch({
      children: [Match({ when: true, children: () => child })],
    })
    expect(result).toBe(child)
  })

  test('primer match gana (no evalúa los siguientes)', () => {
    let secondEvaluated = false
    Switch({
      children: [
        Match({ when: true,  children: h('p', null, 'first') }),
        Match({ when: true,  children: () => { secondEvaluated = true; return h('p') } }),
      ],
    })
    expect(secondEvaluated).toBe(false)
  })

  test('Match devuelve SwitchCase con _type match', () => {
    const m = Match({ when: true, children: h('p') })
    expect(m._type).toBe('match')
    expect(m.when).toBe(true)
  })
})

// ─── Each ─────────────────────────────────────────────────────────────────────
describe('Each()', () => {
  test('equivalente a For sin key', () => {
    const items = ['x', 'y']
    const node = Each(items, (s) => h('span', null, s))
    expect(node.type).toBe('fragment')
    expect((node as any).children.length).toBe(2)
  })

  test('con key function', () => {
    const items = [{ id: '1' }, { id: '2' }]
    const node = Each(items, (item) => h('div', null, item.id), (item) => item.id)
    const children = (node as any).children as ComponentNode[]
    expect((children[0] as any).key).toBe('1')
    expect((children[1] as any).key).toBe('2')
  })

  test('lista vacía → FragmentNode vacío', () => {
    const node = Each([], (_x: never) => h('div'))
    expect((node as any).children.length).toBe(0)
  })
})
