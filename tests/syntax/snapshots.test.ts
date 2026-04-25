// ============================================================
// tests/syntax/snapshots.test.ts — Tests de regresión estructural (C14)
// ============================================================

import { test, expect } from 'bun:test'
import { h } from '../../src/syntax/h.js'
import { stack, row, grid, box } from '../../src/syntax/layout.js'

// Bun soporta toMatchSnapshot() nativo desde v1.0.
// La primera ejecución genera el snapshot; las siguientes comparan contra él.

test('h() — snapshot Card', () => {
  const node = h('article', { class: 'card', flex: 'column', gap: 8 },
    h('h3', null, 'Título'),
    h('p', null, 'Cuerpo'),
  )
  expect(node).toMatchSnapshot()
})

test('h() — snapshot con attrs y eventos', () => {
  const fn = () => {}
  const node = h('button', {
    id: 'submit-btn',
    disabled: true,
    onClick: fn,
    aria: { label: 'Enviar formulario' },
    data: { testid: 'submit' },
  }, 'Enviar')
  // Excluimos el handler de la snapshot (referencia de función)
  expect({ ...node, on: Object.keys(node.on ?? {}) }).toMatchSnapshot()
})

test('h() — snapshot breakpoints (at)', () => {
  const node = h('div', {
    flex: 'column',
    at: { sm: { flex: 'row' }, md: { gap: 16 } },
  })
  expect(node).toMatchSnapshot()
})

test('stack() — snapshot', () => {
  const node = stack({ gap: 16, padding: 24 },
    h('p', null, 'A'),
    h('p', null, 'B'),
  )
  expect(node).toMatchSnapshot()
})

test('row() — snapshot', () => {
  const node = row({ gap: 8, align: 'center' },
    h('img', { src: '/avatar.png', alt: 'Avatar' }),
    h('span', null, 'Usuario'),
  )
  expect(node).toMatchSnapshot()
})

test('grid(3) — snapshot', () => {
  const node = grid(3, { gap: 8 },
    h('div', null, '1'),
    h('div', null, '2'),
    h('div', null, '3'),
  )
  expect(node).toMatchSnapshot()
})

test('box() con tag semántico — snapshot', () => {
  const node = box('section', { flex: 'column', padding: 16 },
    h('h2', null, 'Sección'),
  )
  expect(node).toMatchSnapshot()
})
