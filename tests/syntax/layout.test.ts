// ============================================================
// tests/syntax/layout.test.ts — Tests del Layout DSL
// ============================================================

import { describe, test, expect } from 'bun:test'
import { stack, vstack, row, grid, box } from '../../src/syntax/layout.js'
import { h } from '../../src/syntax/h.js'

describe('stack()', () => {
  test('produce ElementNode con flex: column', () => {
    const node = stack()
    expect(node.type).toBe('element')
    expect(node.tag).toBe('div')
    expect(node.layout?.flexDirection).toBe('column')
  })

  test('con hijos', () => {
    const node = stack(null, h('p', null, 'A'), h('p', null, 'B'))
    expect(node.children!.length).toBe(2)
  })

  test('con gap y padding', () => {
    const node = stack({ gap: 16, padding: 24 })
    expect(node.layout?.gap).toBe(16)
    expect(node.layout?.padding).toBe(24)
  })

  test('con tag personalizado', () => {
    const node = stack({ tag: 'section', gap: 8 } as any)
    expect(node.tag).toBe('section')
    expect(node.layout?.flexDirection).toBe('column')
  })
})

describe('vstack — alias de stack', () => {
  test('es idéntico a stack', () => {
    const s = stack({ gap: 8 }, h('div'))
    const v = vstack({ gap: 8 }, h('div'))
    expect(s.layout).toEqual(v.layout)
    expect(s.tag).toBe(v.tag)
  })
})

describe('row()', () => {
  test('produce ElementNode con flex: row', () => {
    const node = row()
    expect(node.type).toBe('element')
    expect(node.layout?.flexDirection).toBe('row')
  })

  test('con align center', () => {
    const node = row({ align: 'center' })
    expect(node.layout?.alignItems).toBe('center')
    expect(node.layout?.flexDirection).toBe('row')
  })

  test('con hijos', () => {
    const node = row(null, h('span', null, 'A'), h('span', null, 'B'))
    expect(node.children!.length).toBe(2)
  })
})

describe('grid()', () => {
  test('número de columnas → gridTemplateColumns repeat', () => {
    const node = grid(3)
    expect(node.layout?.gridTemplateColumns).toBe('repeat(3, 1fr)')
  })

  test('string repeat de columnas → pasa directo', () => {
    const node = grid('repeat(4, 1fr)')
    // gridTemplateColumns no está en el tipo LayoutProps como string genérico
    // pero el layout se genera con la string provista
    expect(node.layout?.gridTemplateColumns).toBe('repeat(4, 1fr)')
    expect(node.layout?.display).toBe('grid')
  })

  test('display siempre es grid', () => {
    expect(grid(2).layout?.display).toBe('grid')
  })

  test('gap se propaga al layout', () => {
    const node = grid(3, { gap: 16 })
    expect(node.layout?.gap).toBe(16)
  })

  test('padding se propaga al layout', () => {
    const node = grid(3, { padding: 24 })
    expect(node.layout?.padding).toBe(24)
  })

  test('columnGap y rowGap se propagan', () => {
    const node = grid(3, { columnGap: 8, rowGap: 12 })
    expect(node.layout?.columnGap).toBe(8)
    expect(node.layout?.rowGap).toBe(12)
  })

  // C7: fusiona layout del usuario, no lo descarta
  test('layout explícito del usuario se fusiona (C7)', () => {
    const node = grid(3, { layout: { padding: 32 } })
    expect(node.layout?.display).toBe('grid')           // base no se pierde
    expect(node.layout?.gridTemplateColumns).toBe('repeat(3, 1fr)')
    expect(node.layout?.padding).toBe(32)               // del usuario
  })

  test('con hijos', () => {
    const node = grid(2, null, h('div', null, '1'), h('div', null, '2'))
    expect(node.children!.length).toBe(2)
  })
})

describe('box()', () => {
  test('con tag explícito → usa ese tag', () => {
    const node = box('article', { class: 'card' })
    expect(node.tag).toBe('article')
    expect(node.classes).toEqual(['card'])
  })

  test('sin tag → usa div', () => {
    const node = box({ class: 'wrapper' })
    expect(node.tag).toBe('div')
  })

  test('con hijos', () => {
    const node = box('section', null, h('h1', null, 'Título'))
    expect(node.children!.length).toBe(1)
  })

  test('con tag explícito y props omitidas trata el primer nodo como hijo', () => {
    const child = h('h1', null, 'Título')
    const node = box('section', child)

    expect(node.attrs).toBeUndefined()
    expect(node.children).toEqual([child])
  })

  test('equivalente a h() con el mismo tag', () => {
    const fromBox = box('article', { flex: 'column', gap: 8 })
    const fromH   = h('article', { flex: 'column', gap: 8 })
    expect(fromBox.type).toBe(fromH.type)
    expect(fromBox.tag).toBe(fromH.tag)
    expect(fromBox.layout).toEqual(fromH.layout)
  })
})

describe('layout shortcuts: space-around + baseline via h()', () => {
  test('row con justify: space-around', () => {
    const node = h('div', { flex: 'row', justify: 'space-around' })
    expect(node.layout?.flexDirection).toBe('row')
    expect(node.layout?.justifyContent).toBe('space-around')
  })

  test('row con align: baseline', () => {
    const node = h('div', { flex: 'row', align: 'baseline' })
    expect(node.layout?.flexDirection).toBe('row')
    expect(node.layout?.alignItems).toBe('baseline')
  })
})
