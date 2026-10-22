// ============================================================
// Style API + Token System — unit contracts (TDD red → green)
// Fase 3: Ruta B
// ============================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach, spyOn } from 'bun:test'
import { Window } from 'happy-dom'
import {
  validateStyleProps,
  resolveStyleTokens,
  createTheme,
  applyStyleToElement,
  SAFE_STYLE_KEYS,
} from '../src/features/style.js'
import type { SafeStyleProps, ThemeTokens, Theme } from '../src/features/style.js'
import { commitFull, commitHydrate, applyOps } from '../src/render/commit.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { defineComponent } from '../src/render/component.js'

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
// 5. Dev-mode whitelist enforcement in applyStyleToElement (H-9 / T5)
// ---------------------------------------------------------------------------
describe('applyStyleToElement — dev-mode whitelist enforcement (H-9)', () => {
  const savedDevFlag = globalThis.__AXIOM_DEV__

  // Isolate the dev flag from other test files: bun runs test files in
  // parallel within one process, so a sibling file that sets
  // `__AXIOM_DEV__ = true` can leak into this describe block. Reset it
  // before every test so each case declares the mode it exercises.
  beforeEach(() => {
    globalThis.__AXIOM_DEV__ = undefined
  })

  afterEach(() => {
    globalThis.__AXIOM_DEV__ = savedDevFlag
  })

  it('dev: drops unknown/unsafe props and still applies whitelisted ones', () => {
    globalThis.__AXIOM_DEV__ = true
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const el = document.createElement('div')
      const props = { color: 'red', evilPropA: 'javascript:alert(1)' } as unknown as SafeStyleProps
      applyStyleToElement(el, props)
      expect(el.style.color).toBe('red')
      expect((el.style as unknown as Record<string, unknown>).evilPropA).toBeUndefined()
      expect(el.style.cssText).not.toContain('evilPropA')
      expect(el.style.cssText).not.toContain('javascript')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(String(warnSpy.mock.calls[0]![0])).toContain('evilPropA')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('dev: warns only once per offending prop name', () => {
    globalThis.__AXIOM_DEV__ = true
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const el = document.createElement('div')
      applyStyleToElement(el, { evilPropB: 'x' } as unknown as SafeStyleProps)
      applyStyleToElement(el, { evilPropB: 'y' } as unknown as SafeStyleProps)
      expect((el.style as unknown as Record<string, unknown>).evilPropB).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('dev: valid whitelisted props still apply normally (preserve contract)', () => {
    globalThis.__AXIOM_DEV__ = true
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const el = document.createElement('div')
      applyStyleToElement(el, { color: 'red', fontSize: '16px', borderRadius: '4px' })
      expect(el.style.color).toBe('red')
      expect(el.style.fontSize).toBe('16px')
      expect(el.style.borderRadius).toBe('4px')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('production: skips key validation and warnings, retaining the value security floor', () => {
    globalThis.__AXIOM_DEV__ = false
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const el = document.createElement('div')
      const props = { color: 'red', evilPropC: 'literal' } as unknown as SafeStyleProps
      applyStyleToElement(el, props)
      expect(el.style.color).toBe('red')
      // Production still skips key validation, but no longer skips value security.
      expect((el.style as unknown as Record<string, unknown>).evilPropC).toBe('literal')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('S121 style regressions', () => {
  const savedDev = globalThis.__AXIOM_DEV__
  afterEach(() => { globalThis.__AXIOM_DEV__ = savedDev })

  it('blocks remote CSS URLs in production, including escaped and nested forms', () => {
    globalThis.__AXIOM_DEV__ = false
    for (const value of [
      'url(https://attacker.invalid/pixel)',
      'URL("//attacker.invalid/pixel")',
      'url(/pixel)',
      'u\\\\72l(https://attacker.invalid/pixel)',
      'u/**/rl(https://attacker.invalid/pixel)',
      'image-set("https://attacker.invalid/pixel" 1x)',
      'url(data:text/html;base64,YQ==)',
    ]) {
      const el = document.createElement('div')
      applyStyleToElement(el, { backgroundImage: value })
      expect(el.style.backgroundImage).toBe('')
    }
    const el = document.createElement('div')
    applyStyleToElement(el, { backgroundImage: 'url("data:image/png;base64,YQ==")' })
    expect(el.style.backgroundImage).toContain('data:image/png;base64,YQ==')
  })

  it('clears an explicitly empty whitelisted value through applyOps, retaining omitted keys', () => {
    globalThis.__AXIOM_DEV__ = true
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const root = document.createElement('div')
      const el = document.createElement('div')
      applyStyleToElement(el, { letterSpacing: '2px', color: 'red' })
      applyOps([{ type: 'update', index: 0, newStyle: { letterSpacing: '' } }], root, [el])
      expect(el.style.letterSpacing).toBe('')
      expect(el.style.color).toBe('red')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toContain('empty style value for key "letterSpacing"')
    } finally { warn.mockRestore() }
  })

  it('validates raw attrs.style in full commit, inserts and hydration with shared warn-once', () => {
    globalThis.__AXIOM_DEV__ = true
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const component = defineComponent(() => ({
        type: 'element' as const, tag: 'div', attrs: { style: 'min-width:123px;color:red' },
      }))
      const prepared = prepare(component, undefined)
      const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 })
      const root = document.createElement('div')
      const state = { domNodes: [], portalRoots: new Map() }
      commitFull(layout, prepared, root, state)
      const full = root.firstElementChild as HTMLElement
      expect(full.style.minWidth).toBe('')
      expect(full.style.color).toBe('red')
      applyOps([{ type: 'insert', index: 0, tag: 'div', attrs: { style: 'min-width:123px;color:red' } }], root, [])
      expect((root.lastElementChild as HTMLElement).style.minWidth).toBe('')
      root.innerHTML = '<div data-axiom-id="0" style="min-width:123px;color:red"></div>'
      commitHydrate(layout, prepared, root, state)
      expect((root.firstElementChild as HTMLElement).style.minWidth).toBe('')
      expect((root.firstElementChild as HTMLElement).style.color).toBe('red')
      applyStyleToElement(full, { minWidth: '2px' } as unknown as SafeStyleProps)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toContain('minWidth')
    } finally { warn.mockRestore() }
  })
})

// ---------------------------------------------------------------------------
// 6. Integration with ElementNode — style persists through pipeline
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
