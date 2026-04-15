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
  for (const [key, value] of Object.entries(props)) {
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
 * Apply SafeStyleProps to an HTMLElement.
 *
 * Write-only — never reads from el.style.
 * Only applies keys present in the given props object.
 *
 * Call validateStyleProps() before this if you want runtime key validation
 * (e.g., in development mode). In production, assume props are pre-validated.
 */
export function applyStyleToElement(el: HTMLElement, props: SafeStyleProps): void {
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      // CSSStyleDeclaration supports index access by property name
      ;(el.style as unknown as Record<string, unknown>)[key] = value
    }
  }
}
