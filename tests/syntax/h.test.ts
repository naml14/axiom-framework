// ============================================================
// tests/syntax/h.test.ts — Tests unitarios de h(), t(), fragment()
// ============================================================

import { describe, test, expect } from 'bun:test'
import { h, t, fragment, normalizeChildren } from '../../src/syntax/h.js'

// ─── Nodos básicos ────────────────────────────────────────────────────────────
describe('h() — nodos básicos', () => {
  test('crea ElementNode mínimo con type y tag', () => {
    const node = h('div')
    expect(node.type).toBe('element')
    expect(node.tag).toBe('div')
    expect(node.children).toEqual([])
  })

  test('string hijo → TextNode automático', () => {
    const node = h('p', null, 'Hola')
    expect(node.children![0]).toEqual({ type: 'text', content: 'Hola' })
  })

  test('number hijo → TextNode con string', () => {
    const node = h('span', null, 42)
    expect(node.children![0]).toEqual({ type: 'text', content: '42' })
  })

  test('filtra null, undefined y false', () => {
    const node = h('div', null, null, undefined, false, 'texto')
    expect(node.children!.length).toBe(1)
    expect(node.children![0]).toEqual({ type: 'text', content: 'texto' })
  })

  test('flatten de arrays de hijos', () => {
    const items = ['a', 'b', 'c']
    const node = h('ul', null, items.map(i => h('li', null, i)))
    expect(node.children!.length).toBe(3)
    expect((node.children![0] as any).tag).toBe('li')
  })

  test('flatten recursivo de arrays anidados', () => {
    const node = h('div', null, [['a', 'b'], ['c']])
    expect(node.children!.length).toBe(3)
  })

  test('props null no rompe', () => {
    const node = h('div', null, 'texto')
    expect(node.classes).toBeUndefined()
    expect(node.attrs).toBeUndefined()
    expect(node.on).toBeUndefined()
  })
})

// ─── t() ─────────────────────────────────────────────────────────────────────
describe('t() — texto explícito', () => {
  test('string → TextNode', () => {
    expect(t('Hola')).toEqual({ type: 'text', content: 'Hola' })
  })
  test('number → TextNode con string', () => {
    expect(t(99)).toEqual({ type: 'text', content: '99' })
  })
})

// ─── fragment() ──────────────────────────────────────────────────────────────
describe('fragment()', () => {
  test('crea FragmentNode', () => {
    const f = fragment(h('div'), h('span'))
    expect(f.type).toBe('fragment')
    expect(f.children.length).toBe(2)
  })

  test('fragment vacío', () => {
    const f = fragment()
    expect(f.type).toBe('fragment')
    expect(f.children).toEqual([])
  })
})

// ─── Clases ───────────────────────────────────────────────────────────────────
describe('h() — clases', () => {
  test('class string → array split por espacios', () => {
    expect(h('div', { class: 'foo bar baz' }).classes).toEqual(['foo', 'bar', 'baz'])
  })

  test('class array → pasa directo', () => {
    expect(h('div', { class: ['foo', 'bar'] }).classes).toEqual(['foo', 'bar'])
  })

  test('class string vacío → undefined', () => {
    expect(h('div', { class: '' }).classes).toBeUndefined()
  })

  test('class array vacío → undefined', () => {
    expect(h('div', { class: [] }).classes).toBeUndefined()
  })

  test('class undefined → undefined', () => {
    expect(h('div').classes).toBeUndefined()
  })
})

// ─── Handlers de eventos (C4 — mapa sintético) ───────────────────────────────
describe('h() — handlers de eventos (C4)', () => {
  test('onClick → on.click', () => {
    const fn = () => {}
    const node = h('button', { onClick: fn })
    expect(node.on?.['click']).toBe(fn)
  })

  test('onDoubleClick → on.dblclick (mapa sintético)', () => {
    const fn = () => {}
    expect(h('div', { onDoubleClick: fn }).on?.['dblclick']).toBe(fn)
  })

  test('onMouseEnter → on.mouseenter (mapa sintético)', () => {
    const fn = () => {}
    expect(h('div', { onMouseEnter: fn }).on?.['mouseenter']).toBe(fn)
  })

  test('onMouseLeave → on.mouseleave (mapa sintético)', () => {
    const fn = () => {}
    expect(h('div', { onMouseLeave: fn }).on?.['mouseleave']).toBe(fn)
  })

  test('onKeyDown → on.keydown', () => {
    const fn = () => {}
    expect(h('input', { onKeyDown: fn }).on?.['keydown']).toBe(fn)
  })

  test('onContextMenu → on.contextmenu', () => {
    const fn = () => {}
    expect(h('div', { onContextMenu: fn }).on?.['contextmenu']).toBe(fn)
  })

  test('onAnimationEnd → on.animationend', () => {
    const fn = () => {}
    expect(h('div', { onAnimationEnd: fn }).on?.['animationend']).toBe(fn)
  })

  test('onTransitionEnd → on.transitionend', () => {
    const fn = () => {}
    expect(h('div', { onTransitionEnd: fn }).on?.['transitionend']).toBe(fn)
  })

  test('sin handlers → on undefined', () => {
    expect(h('div', { class: 'foo' }).on).toBeUndefined()
  })
})

// ─── Layout shortcuts ─────────────────────────────────────────────────────────
describe('h() — layout shortcuts', () => {
  test('flex: column → layout.flexDirection', () => {
    expect(h('div', { flex: 'column' }).layout?.flexDirection).toBe('column')
  })

  test('flex: row → layout.flexDirection', () => {
    expect(h('div', { flex: 'row' }).layout?.flexDirection).toBe('row')
  })

  test('gap y padding', () => {
    const layout = h('div', { gap: 8, padding: 16 }).layout
    expect(layout?.gap).toBe(8)
    expect(layout?.padding).toBe(16)
  })

  test('justify y align', () => {
    const layout = h('div', { justify: 'center', align: 'start' }).layout
    expect(layout?.justifyContent).toBe('center')
    expect(layout?.alignItems).toBe('start')
  })

  test('wrap', () => {
    expect(h('div', { wrap: 'wrap' }).layout?.flexWrap).toBe('wrap')
  })

  // C1: merge determinístico shortcuts + layout explícito
  test('shortcuts + layout explícito → merge, explicit gana en conflicto', () => {
    const layout = h('div', {
      flex: 'column',
      gap: 8,
      layout: { gap: 20, padding: 16 },  // gap en conflicto → explicit gana
    }).layout
    expect(layout?.flexDirection).toBe('column')  // del shortcut
    expect(layout?.gap).toBe(20)                  // explicit gana
    expect(layout?.padding).toBe(16)              // del explicit
  })

  test('solo layout explícito → se usa tal cual', () => {
    const layout = h('div', { layout: { gap: 12, flexDirection: 'row' } }).layout
    expect(layout?.gap).toBe(12)
    expect(layout?.flexDirection).toBe('row')
  })

  test('sin shortcuts ni layout → layout undefined', () => {
    expect(h('div', { class: 'foo' }).layout).toBeUndefined()
  })

  test('sin props → layout undefined', () => {
    expect(h('div').layout).toBeUndefined()
  })
})

// ─── Attrs (C2 — whitelist) ───────────────────────────────────────────────────
describe('h() — attrs (C2: whitelist)', () => {
  test('id → attrs.id', () => {
    expect(h('div', { id: 'main' }).attrs?.['id']).toBe('main')
  })

  test('href → attrs.href', () => {
    expect(h('a', { href: '/home' }).attrs?.['href']).toBe('/home')
  })

  test('disabled → attrs.disabled', () => {
    expect(h('button', { disabled: true }).attrs?.['disabled']).toBe('')
  })

  test('boolean attr false se omite', () => {
    expect(h('button', { disabled: false }).attrs?.['disabled']).toBeUndefined()
  })

  test('htmlFor → attrs.for (DOM name)', () => {
    expect(h('label', { htmlFor: 'email' }).attrs?.['for']).toBe('email')
  })

  test('data-* desde objeto data', () => {
    const attrs = h('div', { data: { id: '1', type: 'card' } }).attrs
    expect(attrs?.['data-id']).toBe('1')
    expect(attrs?.['data-type']).toBe('card')
  })

  test('aria-* desde objeto aria', () => {
    const attrs = h('button', { aria: { label: 'Cerrar', hidden: false } }).attrs
    expect(attrs?.['aria-label']).toBe('Cerrar')
    expect(attrs?.['aria-hidden']).toBe('false')
  })

  test('attrs explícitos anidados se serializan como escape hatch DOM', () => {
    const attrs = h('div', {
      attrs: {
        id: 'demo',
        style: 'color:#fff;background:#000;',
        title: 'Demo SSR',
        data: { track: 'hero' },
      },
    }).attrs

    expect(attrs?.['id']).toBe('demo')
    expect(attrs?.['style']).toBe('color:#fff;background:#000;')
    expect(attrs?.['title']).toBe('Demo SSR')
    expect(attrs?.['data-track']).toBe('hero')
  })

  test('data y aria ignoran arrays como bolsas de atributos', () => {
    const attrs = h('div', {
      attrs: {
        data: ['bad'] as unknown as Record<string, string>,
        aria: ['bad'] as unknown as Record<string, string | boolean>,
      },
    }).attrs

    expect(attrs?.['data-0']).toBeUndefined()
    expect(attrs?.['aria-0']).toBeUndefined()
  })

  test('props de layout NO terminan en attrs', () => {
    const attrs = h('div', { flex: 'column', gap: 8 }).attrs
    expect(attrs?.['flex']).toBeUndefined()
    expect(attrs?.['gap']).toBeUndefined()
  })

  test('class NO termina en attrs', () => {
    expect(h('div', { class: 'foo' }).attrs?.['class']).toBeUndefined()
  })

  test('sin attrs relevantes → attrs undefined', () => {
    expect(h('div', { gap: 8 }).attrs).toBeUndefined()
  })
})

// ─── key ─────────────────────────────────────────────────────────────────────
describe('h() — key', () => {
  test('key se propaga', () => {
    expect(h('li', { key: 'item-1' }).key).toBe('item-1')
  })
  test('sin key → key undefined', () => {
    expect(h('li').key).toBeUndefined()
  })
})

// ─── normalizeChildren standalone ────────────────────────────────────────────
describe('normalizeChildren()', () => {
  test('array vacío → vacío', () => {
    expect(normalizeChildren([])).toEqual([])
  })

  test('filtra null/undefined/false', () => {
    expect(normalizeChildren([null, undefined, false])).toEqual([])
  })
})

describe('layout shortcuts: space-around + baseline validation', () => {
  test('justify: space-around se mapea a justifyContent', () => {
    const layout = h('div', { justify: 'space-around' }).layout
    expect(layout?.justifyContent).toBe('space-around')
  })

  test('align: baseline se mapea a alignItems', () => {
    const layout = h('div', { align: 'baseline' }).layout
    expect(layout?.alignItems).toBe('baseline')
  })

  test('justify con valor inválido no produce justifyContent', () => {
    const layout = h('div', { justify: 'invalid' as never }).layout
    expect(layout?.justifyContent).toBeUndefined()
  })

  test('align con valor inválido no produce alignItems', () => {
    const layout = h('div', { align: 'invalid' as never }).layout
    expect(layout?.alignItems).toBeUndefined()
  })

  test('todos los valores de justify válidos se aceptan', () => {
    const values = ['start', 'center', 'end', 'space-between', 'space-around'] as const
    for (const v of values) {
      const layout = h('div', { justify: v }).layout
      expect(layout?.justifyContent).toBe(v)
    }
  })

  test('todos los valores de align válidos se aceptan', () => {
    const values = ['start', 'center', 'end', 'stretch', 'baseline'] as const
    for (const v of values) {
      const layout = h('div', { align: v }).layout
      expect(layout?.alignItems).toBe(v)
    }
  })
})
