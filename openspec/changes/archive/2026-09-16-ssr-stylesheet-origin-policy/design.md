# Design: SSR Stylesheet Origin Policy

## Technical Approach

Remove the hardcoded `ALLOWED_STYLESHEET_ORIGIN` placeholder from `src/ssr.ts` and reuse the URL-scheme rules already owned by `src/core/attrs.ts`. Origin trust remains outside the framework: consumers validate semantic hosts and enforce CSP `style-src`. The framework provides only a consistent safety floor for dangerous schemes and protocol-relative URLs.

This design intentionally refines the proposal's `#blocked` stylesheet output: component attributes still use `href="#blocked"`, but stylesheet metadata will omit blocked `<link>` tags because a blocked stylesheet resource is useless in `<head>`.

## Architecture Decisions

| Decision | Alternatives considered | Choice / Rationale |
|----------|-------------------------|--------------------|
| Reuse vs extract | Call `sanitizeAttrValue('href', href)` directly; duplicate regexes in `ssr.ts`; export private regexes | Extract and export one small internal helper from `attrs.ts`, e.g. `sanitizeUrlValue(value: string): string`. `DANGEROUS_URL_SCHEME_RE`, `SAFE_URL_PATTERN`, and `PROTOCOL_RELATIVE_URL_RE` are currently module-private; `hasDangerousUrlScheme`, `isUrlSensitiveAttr`, and `sanitizeAttrValue` are exported, but `hasDangerousUrlScheme` alone does not catch protocol-relative URLs. A shared helper lets both `sanitizeAttrValue` and `renderHead()` use one rule source without exposing regex internals or over-engineering. Do not re-export it from `src/index.ts`. |
| Blocked stylesheet output | Emit `<link rel="stylesheet" href="#blocked">`; omit the tag | Omit the tag. `#blocked` is useful for preserving ordinary attribute shape, but in `<head>` it creates a dead stylesheet declaration and may trigger a pointless same-document CSS fetch. The normative contract: dangerous stylesheet hrefs MUST NOT be emitted. |
| Origin policy | Hardcoded allowlist; configurable `SSRRenderOptions.allowedStylesheetOrigins`; CSP only | No framework allowlist and no new SSR option. The previous regex was the bug. CSP `style-src` plus consumer validation is the correct origin-enforcement layer. |

## Data Flow

```text
SSRMetadata.stylesheets[]
  -> sanitizeUrlValue(rawHref)        // before HTML escaping
  -> if '#blocked': omit <link>
  -> escapeHtml(sanitizedHref)
  -> append <link rel="stylesheet" href="...">
```

Exact loop shape:

```ts
if (metadata.stylesheets !== undefined) {
  for (const href of metadata.stylesheets) {
    const sanitizedHref = sanitizeUrlValue(href)
    if (sanitizedHref === '#blocked') continue
    html += `<link rel="stylesheet" href="${escapeHtml(sanitizedHref)}">`
  }
}
```

Sanitize/validate before `escapeHtml()`. Escaping is only output encoding; it must not run before scheme checks because encoded text can hide the original URL semantics from the sanitizer.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/attrs.ts` | Modify | Add exported internal helper `sanitizeUrlValue(value: string): string`; move existing protocol-relative, safe-pattern, and dangerous-scheme checks into it; keep regex constants private. Update `sanitizeAttrValue()` to call the helper for URL-sensitive attrs. |
| `src/ssr.ts` | Modify | Import `sanitizeUrlValue`; remove `ALLOWED_STYLESHEET_ORIGIN`; omit blocked stylesheet links; escape only emitted hrefs. No `SSRMetadata` or `SSRRenderOptions` shape change. |
| `SECURITY.md` | Modify | Update External Stylesheet SSRF section: Axiom blocks dangerous schemes/protocol-relative hrefs, but CSP `style-src` and consumer host validation are required for origin trust and CSS exfiltration defense. |
| `tests/ssr.test.ts` | Modify | Add SSR metadata stylesheet tests. |

## Interfaces / Contracts

```ts
// src/core/attrs.ts, internal module export only
export function sanitizeUrlValue(value: string): string
```

Contract for `metadata.stylesheets`:
- valid relative, `http://`, and `https://` hrefs are emitted;
- dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`) are omitted;
- protocol-relative `//host/style.css` hrefs are omitted;
- output hrefs are HTML-escaped after validation.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Shared sanitizer keeps existing attr behavior and blocks protocol-relative URLs | Extend existing `attrs.ts` tests if needed; current `edge-cases.test.ts` already covers much of `sanitizeAttrValue`. |
| SSR integration | Stylesheet loop emits Google Fonts/custom CDN and relative URLs; omits dangerous/protocol-relative hrefs; escapes query params | Add tests in `tests/ssr.test.ts` near `inyecta metadata en head`. Existing tests should not change except expectations if a new stylesheet case is added. |
| Docs | SECURITY.md names CSP `style-src` as origin layer | Existing markdown/text assertions are not required unless already present. Run `bun test`. |

## Migration / Rollout

No migration required. This restores legitimate external stylesheets and only suppresses values that are already unsafe under component href sanitization.

## Non-goals

- No configurable stylesheet allowlist.
- No new `SSRRenderOptions` field.
- No new dependencies or URL parser.
- No CSP generation by the framework.

## Open Questions

None.
