// ============================================================
// tests/syntax/integration.test.ts — Integración con el motor
// ============================================================
//
// Verifica que h() produce un árbol equivalente al de objetos literales,
// y que prepare() procesa correctamente los nodos generados por la capa de sintaxis.
// ============================================================

import { describe, test, expect } from 'bun:test'
import { h } from '../../src/syntax/h.js'
import { stack, row, grid } from '../../src/syntax/layout.js'
import { For, Show } from '../../src/syntax/flow.js'
import { prepare } from '../../src/render/prepare.js'
import { defineComponent } from '../../src/render/component.js'

// ─── h() vs objetos literales ─────────────────────────────────────────────────
describe('h() vs objetos literales — equivalencia en prepare()', () => {
  test('nodo simple produce el mismo tipo de árbol preparado', () => {
    const WithH = defineComponent(() =>
      h('div', { flex: 'column', gap: 8 },
        h('h1', null, 'Test')
      )
    )
    const WithLiteral = defineComponent(() => ({
      type:   'element' as const,
      tag:    'div',
      layout: { flexDirection: 'column' as const, gap: 8 },
      children: [{
        type:     'element' as const,
        tag:      'h1',
        children: [{ type: 'text' as const, content: 'Test' }],
      }],
    }))

    const ph = prepare(WithH, undefined) as any
    const pl = prepare(WithLiteral, undefined) as any

    expect(ph.nodeType).toBe(pl.nodeType)
    expect(ph.tag).toBe(pl.tag)
    expect(ph.layout?.flexDirection).toBe(pl.layout?.flexDirection)
    expect(ph.layout?.gap).toBe(pl.layout?.gap)

    // Hijo h1
    const childH = ph.children?.[0]
    const childL = pl.children?.[0]
    expect(childH?.tag).toBe('h1')
    expect(childL?.tag).toBe('h1')
  })
})

// ─── stack(), row(), grid() con prepare() ────────────────────────────────────
describe('Layout DSL con prepare()', () => {
  test('stack() genera layout flexDirection column', () => {
    const Comp = defineComponent(() =>
      stack({ gap: 16 }, h('p', null, 'A'))
    )
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.layout?.flexDirection).toBe('column')
    expect(prepared.layout?.gap).toBe(16)
  })

  test('row() genera layout flexDirection row', () => {
    const Comp = defineComponent(() => row({ gap: 8 }))
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.layout?.flexDirection).toBe('row')
  })

  test('grid(3) genera display grid con 3 columnas', () => {
    const Comp = defineComponent(() => grid(3, { gap: 8 }))
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.layout?.display).toBe('grid')
    expect(prepared.layout?.gridTemplateColumns).toBe('repeat(3, 1fr)')
  })
})

// ─── Controles de flujo con prepare() ────────────────────────────────────────
describe('Control de flujo con prepare()', () => {
  test('Show(true) pasa el children a prepare()', () => {
    const Comp = defineComponent(() =>
      Show({
        when: true,
        children: h('p', null, '¡Visible!'),
      })
    )
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.tag).toBe('p')
  })

  test('Show(false) devuelve fragmento vacío', () => {
    const Comp = defineComponent(() =>
      Show({
        when: false,
        children: h('p', null, 'Oculto'),
      })
    )
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.nodeType).toBe('fragment')
    expect(prepared.children?.length ?? 0).toBe(0)
  })

  test('For() genera un fragmento con N hijos', () => {
    const Comp = defineComponent(() =>
      For({
        each: ['a', 'b', 'c'],
        children: (item) => h('li', null, item),
      })
    )
    const prepared = prepare(Comp, undefined) as any
    expect(prepared.nodeType).toBe('fragment')
    expect(prepared.children?.length).toBe(3)
  })
})

// ─── Benchmark de no-regresión (informal) ─────────────────────────────────────
describe('No-regresión de rendimiento', () => {
  test('h() con 500 nodos se prepara sin errores', () => {
    const Comp = defineComponent(() =>
      h('table', null,
        ...Array.from({ length: 500 }, (_, i) =>
          h('tr', null, h('td', null, String(i)))
        )
      )
    )

    expect(() => prepare(Comp, undefined)).not.toThrow()
  })
})
