# Design: Fix CSS Injection via bodyStyle Metadata

## Technical Approach

The vulnerability exists on line 95 of `src/ssr.ts`: `bodyStyle` is passed through `escapeHtml()` into a `<body style="...">` attribute. HTML escaping prevents `</script>`-style attacks but does not block CSS-specific vectors (`url()`, `@import`, `expression()`, `behavior:`).

The fix is a single-line replacement: use `escapeStyleText()` — the same function already applied to `inlineStyles` on line 209. This function blocks `</style`, `@import`, `url(`, `expression(`, `behavior:`, and `javascript:` — all the CSS injection vectors relevant to inline style attributes.

## Architecture Decisions

### Decision: Reuse `escapeStyleText()` rather than create `escapeStyleAttr()`

**Choice**: Call `escapeStyleText()` on `bodyStyle`, same as `inlineStyles`.

**Alternatives considered**:
- Create a new `escapeStyleAttr()` function that blocks `>` and `"` in addition to CSS patterns
- Create a new `escapeStyleAttr()` that also escapes `<`, `>`, `"`, `'` and `&`

**Rationale**: `escapeStyleText()` is designed for content inside raw-text elements (`<style>`), where the risk is premature termination. For a style *attribute*, the same CSS patterns (`url(`, `@import`, `expression(`) are the actual injection vectors — the HTML attribute quoting (`"..."`) already prevents `>` and `"` from escaping the attribute value. The existing function covers the attack surface.

### Decision: No type-level changes to `SSRMetadata`

**Choice**: Keep `bodyStyle?: string` as-is; only change its sanitization behavior.

**Alternatives considered**:
- Add a `bodyStyleSanitized` field
- Deprecate `bodyStyle` in favor of `inlineStyles`

**Rationale**: The change is a security fix, not an API change. The type contract stays the same; only the output behavior changes (which is the correct behavior).

### Decision: Test in existing `ssr.test.ts`

**Choice**: Add one test case to the existing `SSR: renderToString` describe block.

**Alternatives considered**:
- Create a separate `ssr-security.test.ts` file
- Add tests to `ssr-hydration.test.ts`

**Rationale**: The existing file already has the pattern (`SSR: attrs security policy` describe block), and the test is tightly coupled to `renderToString` output.

## Data Flow

```
user input → SSRMetadata.bodyStyle → escapeStyleText() → <body style="...">
                                  └─ escapeHtml() (current, vulnerable)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/ssr.ts` | Modify | Line 95: `escapeHtml()` → `escapeStyleText()` |
| `tests/ssr.test.ts` | Modify | Add test case verifying `bodyStyle` sanitization against CSS injection payloads |
| `docs/SSR-HYDRATION-CONTRACT.md` | Modify | Add note that `bodyStyle` content is CSS-sanitized before rendering |
| `SECURITY.md` | Modify | Add bodyStyle threat entry under "SSR Threats" with same pattern as `inlineStyles` |

## Interfaces / Contracts

### `escapeStyleText()` — existing, reused

```ts
function escapeStyleText(value: string): string {
  return DANGEROUS_CSS_PATTERNS.reduce(
    (css, [pattern, replacement]) => css.replace(pattern, replacement),
    value,
  )
}
```

Blocked patterns: `</style`, `@import`, `url(`, `expression(`, `behavior:`, `javascript:`.

### Updated `SSRMetadata.bodyStyle` behavior

| Before | After |
|--------|-------|
| `escapeHtml(bodyStyle)` → raw CSS in attribute | `escapeStyleText(bodyStyle)` → sanitized CSS in attribute |
| `url(data:text/html,...)` passes through | `url(data:text/html,...)` stripped |
| `@import url(...)` passes through | `@import` stripped |
| `expression(alert(1))` passes through | `expression(` stripped |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `bodyStyle` with `url(data:...)` → sanitized | Add to `ssr.test.ts`, assert `url(` not in output |
| Unit | `bodyStyle` with `@import` → sanitized | Assert `@import` not in output |
| Unit | `bodyStyle` with `expression()` → sanitized | Assert `expression(` not in output |
| Unit | `bodyStyle` with `javascript:` → sanitized | Assert `javascript:` not in output |
| Unit | Legitimate `bodyStyle` preserved | Assert `color: red; font-weight: bold;` appears intact |
| Regression | Existing SSR tests still pass | Run `bun test` for full suite |

## Migration / Rollout

No migration required. This is a behavior change (CSS is now sanitized), not a data migration. Users who relied on `url()` in `bodyStyle` for legitimate purposes can switch to `inlineStyles` for complex CSS.

## Open Questions

- [ ] None — the proposal and exploration have covered all options and tradeoffs.
