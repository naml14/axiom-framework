// ============================================================
// Style API — safe style props + token resolver + theme system
// Fase 3: Ruta B
// ============================================================
// Design invariants:
//  - No DOM reads. applyStyleToElement is write-only.
//  - Only whitelisted CSS property keys are accepted.
//  - Token references ($namespace.path) are resolved before application.
//  - Theme tokens drive consistency; raw values are accepted as passthrough.
// ============================================================

import { isSafeDataUrl } from '../core/attrs.js'

// ---------------------------------------------------------------------------
// 1. Safe Style Key Whitelist
// ---------------------------------------------------------------------------
// Only layout-safe, non-layout-breaking inline properties.
// Explicitly excludes: position, display, left, top, width, height
// (those are managed by the reflow/commit pipeline, not style props).

export const SAFE_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundRepeat',
  'opacity',
  'visibility',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'textTransform',
  'textOverflow',
  'whiteSpace',
  'verticalAlign',
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'outline',
  'outlineColor',
  'outlineWidth',
  'outlineStyle',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxShadow',
  'cursor',
  'pointerEvents',
  'userSelect',
  'overflow',
  'overflowX',
  'overflowY',
  'zIndex',
  'transition',
  'transform',
  'transformOrigin',
  'filter',
  'backdropFilter',
  'objectFit',
  'objectPosition',
  'listStyle',
  'listStyleType',
  'listStylePosition',
  'wordBreak',
  'wordWrap',
  'resize',
  'appearance',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'justifySelf',
  'gridArea',
] as const

export type SafeStyleKey = (typeof SAFE_STYLE_KEYS)[number]

// SafeStyleProps: only whitelisted keys with string values
export type SafeStyleProps = {
  [K in SafeStyleKey]?: string
}

const SAFE_KEY_SET = new Set<string>(SAFE_STYLE_KEYS)

// ---------------------------------------------------------------------------
// 2. Validation
// ---------------------------------------------------------------------------

/**
 * Dev-environment detection — same mechanism as src/app.ts, src/render/pool.ts
 * and src/render/engines/scratch.ts: the `globalThis.__AXIOM_DEV__` override
 * wins (true/false), otherwise NODE_ENV decides. Style validation is a safety
 * net, so anything not explicitly `production` counts as dev.
 */
function isDevEnvironment(): boolean {
  if (globalThis.__AXIOM_DEV__ === true) return true
  if (globalThis.__AXIOM_DEV__ === false) return false

  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return nodeEnv !== 'production'
}

// Warn-once registry so a repeated offending prop does not spam the console.
const warnedStyleKeys = new Set<string>()

/**
 * Dev-only per-prop check through validateStyleProps. Returns true when the
 * prop is safe to apply; on rejection it warns once per prop name and returns
 * false so the caller drops the prop.
 */
function isSafeStylePropDev(key: string, value: string): boolean {
  try {
    validateStyleProps({ [key]: value } as SafeStyleProps)
    return true
  } catch (err) {
    if (!warnedStyleKeys.has(key)) {
      warnedStyleKeys.add(key)
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`[axiom/style] dev: dropped style prop — ${reason}`)
    }
    return false
  }
}

/**
 * Validates that all keys in the given object belong to the safe whitelist
 * and that no values are empty strings.
 *
 * Throws if any key is invalid or any value is empty.
 */
export function validateStyleProps(props: SafeStyleProps): void {
  for (const [key, value] of Object.entries(props)) {
    if (!SAFE_KEY_SET.has(key)) {
      throw new Error(`[axiom/style] invalid style key: "${key}". Only whitelisted CSS properties are allowed.`)
    }
    if (typeof value === 'string' && value === '') {
      throw new Error(`[axiom/style] empty style value for key "${key}". Provide a valid CSS value.`)
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Token System
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  color: Record<string, string>
  spacing: Record<string, string>
  radius: Record<string, string>
  typography: {
    size: Record<string, string>
    weight: Record<string, string>
  }
}

export interface Theme {
  /**
   * Resolve a token reference like `$color.primary` against this theme.
   * Non-token literals (don't start with `$`) are returned unchanged.
   * Throws if the reference path is not found.
   */
  resolve(tokenRef: string): string
  readonly tokens: ThemeTokens
}

/**
 * Create a Theme from a set of design tokens.
 *
 * Token references use the format: `$namespace.key` or `$namespace.sub.key`
 *
 * @example
 * const theme = createTheme({ color: { primary: '#3b82f6' }, ... })
 * theme.resolve('$color.primary') // → '#3b82f6'
 * theme.resolve('red')            // → 'red' (literal passthrough)
 */
export function createTheme(tokens: ThemeTokens): Theme {
  function resolve(tokenRef: string): string {
    if (!tokenRef.startsWith('$')) return tokenRef

    const path = tokenRef.slice(1).split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = tokens
    for (const segment of path) {
      if (cursor === undefined || cursor === null || typeof cursor !== 'object') {
        throw new Error(`[axiom/style] token not found: "${tokenRef}"`)
      }
      cursor = cursor[segment]
    }

    if (typeof cursor !== 'string') {
      throw new Error(`[axiom/style] token not found: "${tokenRef}" (resolved to non-string)`)
    }

    return cursor
  }

  return { resolve, tokens }
}

// ---------------------------------------------------------------------------
// 4. Token Resolution for SafeStyleProps
// ---------------------------------------------------------------------------

/**
 * Resolve all token references in a SafeStyleProps object against a theme.
 *
 * Returns a new object with all `$token.path` values replaced by their
 * resolved CSS strings. Non-token literals are preserved unchanged.
 *
 * Does NOT mutate the input props object.
 */
export function resolveStyleTokens(
  props: SafeStyleProps,
  theme: Theme
): SafeStyleProps {
  const resolved: SafeStyleProps = {}
  // Object.keys avoids Object.entries' per-call tuple array allocation.
  // Object.keys returns own enumerable properties only — same prototype-chain
  // safety as the C-2 fix in src/syntax/h.ts.
  for (const key of Object.keys(props)) {
    const value = (props as Record<string, string | undefined>)[key]
    if (value !== undefined) {
      ;(resolved as Record<string, string>)[key] = theme.resolve(value)
    }
  }
  return resolved
}

// ---------------------------------------------------------------------------
// 5. DOM Application — write-only
// ---------------------------------------------------------------------------

/**
 * Security floor independent of dev validation. Reject rather than rewrite:
 * rewriting CSS tokens can reconstruct another dangerous token. Escapes and
 * comments are intentionally unsupported, as are image-set's bare-string URLs.
 * Ordinary values take linear scans, with no DOM access or parser allocation.
 */
function sanitizeStyleValue(value: string): string {
  if (/[\\\\]|\/\*|@import\b|\b(?:expression\s*\(|behavior\s*:|javascript\s*:|(?:-webkit-)?image-set\s*\()/i.test(value)) return ''
  let unsafe = false
  const remainder = value.replace(/\burl\s*\(\s*(['"]?)([^()]*?)\1\s*\)/gi, (_match: string, _quote: string, url: string) => {
    if (!isSafeDataUrl(url) || !/^data:[^,;]+;base64,[a-z0-9+/]*={0,2}$/i.test(url.trim())) unsafe = true
    return ''
  })
  return unsafe || /\burl\s*\(/i.test(remainder) ? '' : value
}

/**
 * Internal raw-attribute boundary shared by full commit, inserts and hydration.
 * Parse declarations without CSSOM reads. Unbalanced/escaped CSS is rejected;
 * dev uses the same camel-case whitelist and warn-once registry as style props.
 * Not re-exported from the package API.
 */
export function sanitizeInlineStyle(style: string, preserveFrameworkLayout = false): string {
  if (/[\\\\]|\/\*/.test(style)) return ''
  const declarations: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i <= style.length; i++) {
    const ch = style[i]
    if (quote !== '') {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') { if (--depth < 0) return '' }
    else if ((ch === ';' && depth === 0) || i === style.length) {
      declarations.push(style.slice(start, i))
      start = i + 1
    }
  }
  if (quote !== '' || depth !== 0) return ''
  const validate = isDevEnvironment()
  const safe: string[] = []
  for (const declaration of declarations) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    const name = declaration.slice(0, colon).trim().toLowerCase()
    const key = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    const value = declaration.slice(colon + 1).trim()
    const frameworkLayout = preserveFrameworkLayout && (key === 'position' || key === 'width' || key === 'height')
    if (validate && !frameworkLayout && !isSafeStylePropDev(key, value)) continue
    const sanitized = sanitizeStyleValue(value)
    if (sanitized !== '') safe.push(`${name}:${sanitized}`)
  }
  return safe.join(';')
}

/**
 * Apply only supplied SafeStyleProps, without DOM reads.
 * Dev rejects unknown keys with a shared warn-once policy. Explicit empty
 * whitelisted values warn but clear old styles. All builds sanitize values;
 * production skips key validation, never the URL security floor.
 */
export function applyStyleToElement(el: HTMLElement, props: SafeStyleProps): void {
  const validate = isDevEnvironment()
  // Object.keys avoids Object.entries' per-call tuple array allocation.
  for (const key of Object.keys(props)) {
    const value = (props as Record<string, string | undefined>)[key]
    if (value !== undefined) {
      if (validate && !isSafeStylePropDev(key, value) && !(SAFE_KEY_SET.has(key) && value === '')) continue
      // CSSStyleDeclaration supports index access by property name.
      ;(el.style as unknown as Record<string, unknown>)[key] = sanitizeStyleValue(value)
    }
  }
}
