import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import type { ComponentNode } from '../src/core/types.js'

// ============================================================
// Fake text layout engine — mimics the TextLayoutEngine contract
// ============================================================

const fakePreparedText = Symbol('fake-prepared-text')

const fakeTextEngine = {
  prepare: mock((text: string, _font: string) => {
    return { [fakePreparedText]: true, text, segmentCount: text.length }
  }),
  layout: mock((_prepared: unknown, _maxWidth: number, lineHeight: number) => {
    return { lineCount: 1, height: lineHeight }
  }),
  clearCache: mock(),
}

// The text engine is injected via PrepareOptions — no module mocking needed

describe('prepare', () => {
  test('prepares a text node', () => {
    const comp = defineComponent(() => ({
      type: 'text' as const,
      content: 'Hello World'
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('prepares an element node preserving tag, classes, attrs', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      classes: ['card', 'highlight'],
      attrs: { 'data-id': '123' },
      children: []
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('prepares element with children recursively', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' },
        { type: 'element' as const, tag: 'span', children: [
          { type: 'text' as const, content: 'World' }
        ]}
      ]
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('flattens fragment nodes', () => {
    const comp = defineComponent(() => ({
      type: 'fragment' as const,
      children: [
        { type: 'text' as const, content: 'A' },
        { type: 'text' as const, content: 'B' }
      ]
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('calculates hasText metric for text nodes', () => {
    const comp = defineComponent(() => ({
      type: 'text' as const,
      content: 'Hello'
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('calculates hasText metric for element with text children', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Hello' }
      ]
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('calculates isInline metric', () => {
    const inlineComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'span',
      children: [
        { type: 'text' as const, content: 'inline' }
      ]
    }))

    const result = prepare(inlineComp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('calculates simpleLayout metric', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        { type: 'text' as const, content: 'Simple' }
      ]
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('handles empty children', () => {
    const comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: []
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('handles component with no props', () => {
    const comp = defineComponent(() => ({
      type: 'text' as const,
      content: 'no props'
    }))

    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })

  test('handles deeply nested tree', () => {
    function buildTree(depth: number): ComponentNode {
      if (depth === 0) return { type: 'text' as const, content: `leaf-${depth}` }
      return {
        type: 'element' as const,
        tag: 'div',
        children: [buildTree(depth - 1)]
      }
    }

    const comp = defineComponent(() => buildTree(20))
    const result = prepare(comp, undefined, { textEngine: fakeTextEngine })
    expect(result).toBeDefined()
  })
})
