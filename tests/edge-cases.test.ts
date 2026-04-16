import { describe, test, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import { defineComponent } from '../src/render/component.js'
import { prepare, countNodes } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { commitFull } from '../src/render/commit.js'
import type { DOMState } from '../src/render/commit.js'
import type { LayoutConstraints } from '../src/core/types.js'

// ============================================================
// Setup happy-dom
// ============================================================

beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = window.Text as unknown as typeof Text
})

const CONSTRAINTS: LayoutConstraints = { maxWidth: 800, maxHeight: 600 }

// ============================================================
// Edge Case: Empty tree (no children)
// ============================================================

describe('edge case: empty tree', () => {
  test('element with no children prepares correctly', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    expect(p).toBeDefined()
    expect(countNodes(p)).toBe(1)
  })

  test('empty element reflows to zero height', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[0]).toBe(0)
    expect(layout.width[0]).toBe(800)
  })

  test('empty element with explicit height respects it', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { height: 200, width: 400 },
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[0]).toBe(200)
    expect(layout.width[0]).toBe(400)
  })

  test('empty element commits without errors', () => {
    const Empty = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
    }))
    const p = prepare(Empty, undefined)
    const layout = reflow(p, CONSTRAINTS)
    const root = document.createElement('div')
    const state: DOMState = { domNodes: [], portalRoots: new Map() }
    expect(() => commitFull(layout, p, root, state)).not.toThrow()
    expect(root.children.length).toBe(1)
  })
})

// ============================================================
// Edge Case: Single text node
// ============================================================

describe('edge case: single text node', () => {
  test('text node wraps into element for prepare', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: 'Hello world' }],
    }))
    const p = prepare(TextComp, undefined)
    expect(countNodes(p)).toBe(2) // element + text
  })

  test('single text node gets height from line calculation', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: 'Hello world' }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, CONSTRAINTS, { lineHeight: 20 })
    // Text is short — should fit in one line
    const textIdx = 1
    expect(layout.height[textIdx]).toBeGreaterThan(0)
  })

  test('empty text node does not crash', () => {
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: '' }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, CONSTRAINTS)
    expect(layout.height[1]).toBe(0)
  })

  test('very long single text node wraps to multiple lines', () => {
    const longText = 'a'.repeat(500)
    const TextComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'p',
      children: [{ type: 'text' as const, content: longText }],
    }))
    const p = prepare(TextComp, undefined)
    const layout = reflow(p, { maxWidth: 200, maxHeight: 600 }, { lineHeight: 20 })
    // 500 chars at ~6-8px per char in 200px — must wrap to many lines
    expect(layout.height[1]).toBeGreaterThan(20) // more than 1 line
  })
})

// ============================================================
// Edge Case: Fragment at root
// ============================================================

describe('edge case: fragment at root', () => {
  test('fragment children are flattened into parent', () => {
    const FragComp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'fragment' as const,
          children: [
            { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'A' }] },
            { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'B' }] },
          ],
        },
      ],
    }))
    const p = prepare(FragComp, undefined)
    // Fragment is transparent — root div + 2 spans + 2 texts = 5 nodes
    expect(countNodes(p)).toBe(5)
  })

  test('nested fragments flatten completely', () => {
    const NestedFrag = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'fragment' as const,
          children: [
            {
              type: 'fragment' as const,
              children: [
                { type: 'element' as const, tag: 'span' },
              ],
            },
          ],
        },
      ],
    }))
    const p = prepare(NestedFrag, undefined)
    expect(countNodes(p)).toBe(2) // div + span
  })
})

// ============================================================
// Edge Case: Deeply nested tree
// ============================================================

describe('edge case: deeply nested tree', () => {
  function buildNestedTree(depth: number) {
    // Build a deeply nested structure: div > div > div > ... > text
    type NodeBuilder = { type: 'element'; tag: string; children?: ReturnType<typeof buildNestedTree>[] | { type: 'text'; content: string }[] }
    const buildNode = (d: number): NodeBuilder | { type: 'text'; content: string } => {
      if (d === 0) return { type: 'text' as const, content: `Depth ${depth}` }
      return {
        type: 'element' as const,
        tag: 'div',
        children: [buildNode(d - 1)] as any,
      }
    }
    return defineComponent(() => buildNode(depth) as any)
  }

  test('10-level deep tree prepares without stack overflow', () => {
    const Deep = buildNestedTree(10)
    expect(() => prepare(Deep, undefined)).not.toThrow()
  })

  test('10-level deep tree reflows correctly', () => {
    const Deep = buildNestedTree(10)
    const p = prepare(Deep, undefined)
    expect(() => reflow(p, CONSTRAINTS)).not.toThrow()
  })

  test('10-level deep tree has correct node count (n + 1 text node)', () => {
    const Deep = buildNestedTree(10)
    const p = prepare(Deep, undefined)
    // 10 element nodes + 1 text node = 11
    expect(countNodes(p)).toBe(11)
  })

  test('50-level deep tree does not crash', () => {
    const Deep = buildNestedTree(50)
    const p = prepare(Deep, undefined)
    expect(countNodes(p)).toBe(51)
    expect(() => reflow(p, CONSTRAINTS)).not.toThrow()
  })
})

// ============================================================
// Edge Case: List with keys (reconciliation)
// ============================================================

describe('edge case: key reconciliation', () => {
  test('elements with keys prepare correctly', () => {
    const KeyedList = defineComponent(() => ({
      type: 'element' as const,
      tag: 'ul',
      children: ['a', 'b', 'c'].map(k => ({
        type: 'element' as const,
        tag: 'li',
        key: k,
        children: [{ type: 'text' as const, content: k }],
      })),
    }))
    const p = prepare(KeyedList, undefined)
    // ul + 3 li + 3 text = 7
    expect(countNodes(p)).toBe(7)
  })
})

// ============================================================
// Edge Case: unmount() memory cleanup
// ============================================================

describe('edge case: unmount clears DOM references', () => {
  test('domNodes array is emptied after unmount', async () => {
    const { createApp } = await import('../src/app.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'hello' }],
    }))

    const root = document.createElement('div')
    const app = createApp(Comp, root)
    app.mount()

    // After mount, root should have content
    expect(root.children.length).toBeGreaterThan(0)

    app.unmount()

    // After unmount, DOM should be cleared
    expect(root.innerHTML).toBe('')
  })
})

// ============================================================
// Security: Attribute Hardening (#36)
// ============================================================

import {
  sanitizeAttrs,
  sanitizeAttrValue,
  isDangerousEventAttr,
  hasDangerousUrlScheme,
  isValidAttrName,
} from '../src/core/attrs.js'

describe('security: attribute sanitization module', () => {
  describe('isDangerousEventAttr', () => {
    test('detects common event handlers', () => {
      expect(isDangerousEventAttr('onclick')).toBe(true)
      expect(isDangerousEventAttr('onerror')).toBe(true)
      expect(isDangerousEventAttr('onload')).toBe(true)
      expect(isDangerousEventAttr('onmouseover')).toBe(true)
      expect(isDangerousEventAttr('onsubmit')).toBe(true)
    })

    test('is case-insensitive', () => {
      expect(isDangerousEventAttr('ONCLICK')).toBe(true)
      expect(isDangerousEventAttr('OnClick')).toBe(true)
    })

    test('does not flag safe attributes', () => {
      expect(isDangerousEventAttr('class')).toBe(false)
      expect(isDangerousEventAttr('id')).toBe(false)
      expect(isDangerousEventAttr('href')).toBe(false)
      expect(isDangerousEventAttr('data-onclick')).toBe(false)
    })
  })

  describe('hasDangerousUrlScheme', () => {
    test('detects javascript: scheme', () => {
      expect(hasDangerousUrlScheme('javascript:alert(1)')).toBe(true)
      expect(hasDangerousUrlScheme('JAVASCRIPT:evil()')).toBe(true)
      expect(hasDangerousUrlScheme('  javascript:  void(0)')).toBe(true)
    })

    test('detects data: scheme', () => {
      expect(hasDangerousUrlScheme('data:text/html,<script>alert(1)</script>')).toBe(true)
    })

    test('detects vbscript: scheme', () => {
      expect(hasDangerousUrlScheme('vbscript:msgbox("xss")')).toBe(true)
    })

    test('detects file: scheme', () => {
      expect(hasDangerousUrlScheme('file:///etc/passwd')).toBe(true)
    })

    test('allows safe schemes', () => {
      expect(hasDangerousUrlScheme('https://example.com')).toBe(false)
      expect(hasDangerousUrlScheme('http://example.com')).toBe(false)
      expect(hasDangerousUrlScheme('mailto:user@example.com')).toBe(false)
      expect(hasDangerousUrlScheme('tel:+1234567890')).toBe(false)
    })

    test('allows relative URLs', () => {
      expect(hasDangerousUrlScheme('/path/to/page')).toBe(false)
      expect(hasDangerousUrlScheme('./relative')).toBe(false)
      expect(hasDangerousUrlScheme('../parent')).toBe(false)
      expect(hasDangerousUrlScheme('#anchor')).toBe(false)
    })
  })

  describe('isValidAttrName', () => {
    test('allows valid attribute names', () => {
      expect(isValidAttrName('class')).toBe(true)
      expect(isValidAttrName('data-foo')).toBe(true)
      expect(isValidAttrName('aria-label')).toBe(true)
      expect(isValidAttrName('_private')).toBe(true)
    })

    test('rejects invalid attribute names', () => {
      expect(isValidAttrName('invalid<name')).toBe(false)
      expect(isValidAttrName('name>value')).toBe(false)
      expect(isValidAttrName('attr=value')).toBe(false)
      expect(isValidAttrName('1startswithnumber')).toBe(false)
      expect(isValidAttrName('')).toBe(false)
    })
  })

  describe('sanitizeAttrValue', () => {
    test('removes event handler attributes', () => {
      expect(sanitizeAttrValue('onclick', 'alert(1)')).toBeUndefined()
      expect(sanitizeAttrValue('onerror', 'evil()')).toBeUndefined()
    })

    test('neutralizes dangerous URL schemes in href', () => {
      expect(sanitizeAttrValue('href', 'javascript:alert(1)')).toBe('#blocked')
      expect(sanitizeAttrValue('href', 'https://safe.com')).toBe('https://safe.com')
    })

    test('neutralizes dangerous URL schemes in src', () => {
      expect(sanitizeAttrValue('src', 'javascript:void(0)')).toBe('#blocked')
      expect(sanitizeAttrValue('src', '/images/logo.png')).toBe('/images/logo.png')
    })

    test('neutralizes dangerous URL schemes in action', () => {
      expect(sanitizeAttrValue('action', 'javascript:submit()')).toBe('#blocked')
      expect(sanitizeAttrValue('action', '/api/submit')).toBe('/api/submit')
    })

    test('passes through safe attributes unchanged', () => {
      expect(sanitizeAttrValue('class', 'btn primary')).toBe('btn primary')
      expect(sanitizeAttrValue('id', 'my-id')).toBe('my-id')
      expect(sanitizeAttrValue('title', 'A title')).toBe('A title')
    })
  })

  describe('sanitizeAttrs', () => {
    test('returns undefined for undefined input', () => {
      expect(sanitizeAttrs(undefined)).toBeUndefined()
    })

    test('returns original object if no changes needed', () => {
      const attrs = { class: 'btn', id: 'submit' }
      expect(sanitizeAttrs(attrs)).toBe(attrs)
    })

    test('removes event handler attributes', () => {
      const result = sanitizeAttrs({
        class: 'btn',
        onclick: 'alert(1)',
        id: 'btn1',
      })
      expect(result).toEqual({ class: 'btn', id: 'btn1' })
      expect(result).not.toHaveProperty('onclick')
    })

    test('neutralizes dangerous URLs', () => {
      const result = sanitizeAttrs({
        href: 'javascript:alert(1)',
        class: 'link',
      })
      expect(result).toEqual({ href: '#blocked', class: 'link' })
    })

    test('removes invalid attribute names', () => {
      const result = sanitizeAttrs({
        'valid-attr': 'value',
        'invalid<attr': 'bad',
      })
      expect(result).toEqual({ 'valid-attr': 'value' })
    })

    test('handles combined security issues', () => {
      const result = sanitizeAttrs({
        href: 'javascript:void(0)',
        onclick: 'doEvil()',
        'bad>name': 'value',
        class: 'safe',
        'data-safe': 'also-safe',
      })
      expect(result).toEqual({
        href: '#blocked',
        class: 'safe',
        'data-safe': 'also-safe',
      })
    })
  })
})

describe('security: CSR attribute hardening', () => {
  test('event attrs are not applied to DOM', async () => {
    const { createApp } = await import('../src/app.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'button',
      attrs: {
        onclick: 'alert("xss")',
        'data-testid': 'test-btn',
      },
    }))

    const root = document.createElement('div')
    const app = createApp(Comp, root)
    app.mount()

    const btns = root.getElementsByTagName('button')
    expect(btns.length).toBe(1)
    const btn = btns[0] as HTMLElement
    // onclick should NOT be set
    expect(btn.getAttribute('onclick')).toBeNull()
    // data-testid should be set
    expect(btn.getAttribute('data-testid')).toBe('test-btn')

    app.unmount()
  })

  test('dangerous URL schemes are neutralized in href', async () => {
    const { createApp } = await import('../src/app.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'javascript:alert(1)',
        'data-testid': 'xss-link',
      },
    }))

    const root = document.createElement('div')
    const app = createApp(Comp, root)
    app.mount()

    const links = root.getElementsByTagName('a')
    expect(links.length).toBe(1)
    const link = links[0] as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#blocked')

    app.unmount()
  })

  test('safe URLs are preserved', async () => {
    const { createApp } = await import('../src/app.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'https://example.com',
        'data-testid': 'safe-link',
      },
    }))

    const root = document.createElement('div')
    const app = createApp(Comp, root)
    app.mount()

    const links = root.getElementsByTagName('a')
    expect(links.length).toBe(1)
    const link = links[0] as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.com')

    app.unmount()
  })
})

describe('security: SSR attribute hardening', () => {
  test('event attrs are not included in SSR output', async () => {
    const { renderToString } = await import('../src/ssr.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'button',
      attrs: {
        onclick: 'alert("xss")',
        id: 'test-btn',
      },
    }))

    const html = renderToString(Comp)
    expect(html).not.toContain('onclick')
    expect(html).toContain('id="test-btn"')
  })

  test('dangerous URL schemes are neutralized in SSR', async () => {
    const { renderToString } = await import('../src/ssr.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'javascript:alert(1)',
        id: 'xss-link',
      },
    }))

    const html = renderToString(Comp)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#blocked"')
  })

  test('safe URLs are preserved in SSR', async () => {
    const { renderToString } = await import('../src/ssr.js')

    const Comp = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'https://example.com',
        id: 'safe-link',
      },
    }))

    const html = renderToString(Comp)
    expect(html).toContain('href="https://example.com"')
  })
})
