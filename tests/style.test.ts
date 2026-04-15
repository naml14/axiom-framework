// ============================================================
// Style API + Token System — unit contracts (TDD red → green)
// Fase 3: Ruta B
// ============================================================

import { describe, it, expect, beforeAll } from 'bun:test'
import { Window } from 'happy-dom'
import {
  validateStyleProps,
  resolveStyleTokens,
  createTheme,
  applyStyleToElement,
  SAFE_STYLE_KEYS,
} from '../src/features/style.js'
import type { SafeStyleProps, ThemeTokens, Theme } from '../src/features/style.js'

// Setup happy-dom for DOM tests
beforeAll(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
})

// ---------------------------------------------------------------------------
// 1. Whitelist contract — safe key validation
// ---------------------------------------------------------------------------
describe('validateStyleProps', () => {
  it('accepts safe style keys', () => {
    const props: SafeStyleProps = {
      color: 'red',
      backgroundColor: '#fff',
      fontSize: '16px',
      fontWeight: 'bold',
      borderRadius: '4px',
      opacity: '0.8',
      textAlign: 'center',
      padding: '8px',
    }
    expect(() => validateStyleProps(props)).not.toThrow()
  })

  it('rejects unknown CSS properties that bypass whitelist', () => {
    const dangerous = { '--custom': 'injected' } as unknown as SafeStyleProps
    expect(() => validateStyleProps(dangerous)).toThrow(/invalid style key/)
  })

  it('allows all SAFE_STYLE_KEYS without throwing', () => {
    const props: Partial<Record<string, string>> = {}
    for (const key of SAFE_STYLE_KEYS) {
      props[key] = 'test'
    }
    expect(() => validateStyleProps(props as SafeStyleProps)).not.toThrow()
  })

  it('rejects empty string values', () => {
    // Empty string would reset inline style — disallow as accidental input
    expect(() => validateStyleProps({ color: '' })).toThrow(/empty style value/)
  })

  it('allows numeric values coerced to string for compatible props', () => {
    // opacity is a special numeric prop
    const props: SafeStyleProps = { opacity: '1' }
    expect(() => validateStyleProps(props)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Token system — design tokens and theme creation
// ---------------------------------------------------------------------------
describe('createTheme', () => {
  it('creates a theme from tokens', () => {
    const theme = createTheme({
      color: {
        primary: '#3b82f6',
        surface: '#fff',
        text: '#111',
      },
      spacing: {
        sm: '4px',
        md: '8px',
        lg: '16px',
      },
      radius: {
        sm: '4px',
        md: '8px',
      },
      typography: {
        size: {
          sm: '12px',
          md: '16px',
          lg: '20px',
        },
        weight: {
          regular: '400',
          bold: '700',
        },
      },
    })

    expect(theme).toBeDefined()
    expect(typeof theme.resolve).toBe('function')
  })

  it('resolves token reference $color.primary', () => {
    const theme = createTheme({
      color: { primary: '#3b82f6' },
      spacing: {},
      radius: {},
      typography: { size: {}, weight: {} },
    })
    expect(theme.resolve('$color.primary')).toBe('#3b82f6')
  })

  it('resolves nested token reference $typography.size.md', () => {
    const theme = createTheme({
      color: {},
      spacing: {},
      radius: {},
      typography: { size: { md: '16px' }, weight: {} },
    })
    expect(theme.resolve('$typography.size.md')).toBe('16px')
  })

  it('returns unknown tokens unchanged (passthrough)', () => {
    const theme = createTheme({
      color: {},
      spacing: {},
      radius: {},
      typography: { size: {}, weight: {} },
    })
    // Non-token literals pass through unchanged
    expect(theme.resolve('red')).toBe('red')
  })

  it('throws when token reference path not found', () => {
    const theme = createTheme({
      color: {},
      spacing: {},
      radius: {},
      typography: { size: {}, weight: {} },
    })
    expect(() => theme.resolve('$color.nonexistent')).toThrow(/token not found/)
  })
})

// ---------------------------------------------------------------------------
// 3. resolveStyleTokens — resolve all token refs in a SafeStyleProps object
// ---------------------------------------------------------------------------
describe('resolveStyleTokens', () => {
  const theme = createTheme({
    color: { primary: '#3b82f6', text: '#111' },
    spacing: { md: '8px' },
    radius: { sm: '4px' },
    typography: { size: { md: '16px' }, weight: { bold: '700' } },
  })

  it('resolves token refs in style props', () => {
    const resolved = resolveStyleTokens(
      {
        color: '$color.text',
        backgroundColor: '$color.primary',
        padding: '$spacing.md',
      },
      theme
    )
    expect(resolved.color).toBe('#111')
    expect(resolved.backgroundColor).toBe('#3b82f6')
    expect(resolved.padding).toBe('8px')
  })

  it('passes through non-token literal values', () => {
    const resolved = resolveStyleTokens({ color: 'red', fontSize: '14px' }, theme)
    expect(resolved.color).toBe('red')
    expect(resolved.fontSize).toBe('14px')
  })

  it('returns a new object, does not mutate input', () => {
    const input: SafeStyleProps = { color: '$color.text' }
    const resolved = resolveStyleTokens(input, theme)
    expect(input.color).toBe('$color.text')
    expect(resolved.color).toBe('#111')
  })
})

// ---------------------------------------------------------------------------
// 4. applyStyleToElement — write-only DOM application
// ---------------------------------------------------------------------------
describe('applyStyleToElement', () => {
  it('applies safe style props to an element', () => {
    const el = document.createElement('div')
    applyStyleToElement(el, { color: 'red', fontSize: '16px' })
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('16px')
  })

  it('overwrites previous inline styles for the same key', () => {
    const el = document.createElement('div')
    el.style.color = 'blue'
    applyStyleToElement(el, { color: 'red' })
    expect(el.style.color).toBe('red')
  })

  it('does NOT remove existing styles for keys not in the new props', () => {
    const el = document.createElement('div')
    el.style.fontSize = '14px'
    applyStyleToElement(el, { color: 'red' })
    // fontSize was set outside applyStyleToElement, should remain
    // (commit.ts manages removal separately)
    expect(el.style.fontSize).toBe('14px')
  })

  it('handles empty SafeStyleProps gracefully', () => {
    const el = document.createElement('div')
    expect(() => applyStyleToElement(el, {})).not.toThrow()
  })

  it('applies resolved token values correctly', () => {
    const theme = createTheme({
      color: { primary: '#3b82f6' },
      spacing: {},
      radius: {},
      typography: { size: {}, weight: {} },
    })
    const el = document.createElement('div')
    const resolved = resolveStyleTokens({ backgroundColor: '$color.primary' }, theme)
    applyStyleToElement(el, resolved)
    // After resolution token is a raw CSS value; browser may normalize hex → rgb
    // We verify the property was applied (non-empty) and contains the token's value
    const applied = el.style.backgroundColor
    expect(applied.length).toBeGreaterThan(0)
    // Accept either hex or rgb normalization depending on DOM environment
    expect(applied === '#3b82f6' || applied === 'rgb(59, 130, 246)').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Integration with ElementNode — style persists through pipeline
// ---------------------------------------------------------------------------
describe('Style integration — ElementNode to commit', () => {
  it('style: {} on type check — ElementNode accepts SafeStyleProps', () => {
    // This is a type-level check that also validates runtime shape
    const node: import('../src/core/types.js').ElementNode = {
      type: 'element',
      tag: 'div',
      style: {
        color: 'blue',
        backgroundColor: '#eee',
        borderRadius: '8px',
      },
    }
    expect(node.style?.color).toBe('blue')
  })
})
