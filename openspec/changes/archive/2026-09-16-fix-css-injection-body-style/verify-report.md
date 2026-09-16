# Verify Report: Fix CSS Injection via bodyStyle Metadata

## Status: ✅ COMPLETE

## Summary
The `bodyStyle` SSR metadata field was passing user-provided CSS through `escapeHtml()` only, which does not block CSS-specific injection vectors (`url()`, `@import`, `expression()`). The fix replaces it with `escapeStyleText()` — the same sanitization already used for `inlineStyles`.

## Evidence

### Code (src/ssr.ts:95)
```ts
const bodyAttr = options?.metadata?.bodyStyle !== undefined && options.metadata.bodyStyle.length > 0
  ? ` style="${escapeHtml(escapeStyleText(options.metadata.bodyStyle))}"`
  : ''
```

`escapeStyleText()` (src/ssr.ts:253) blocks:
- `</style` (premature close of raw-text element)
- `@import` (external stylesheet loading)
- `url(` (data exfiltration)
- `expression(` (legacy CSS execution)
- `behavior:` (legacy IE)
- `javascript:` (script execution)

### Tests
- `bun test`: **709 pass, 0 fail, 2 skip** (full suite).
- `bun test tests/ssr.test.ts`: covers bodyStyle rendering and sanitization paths.
- `bunx tsc --noEmit`: 0 errors.

## Files Changed
| File | Action |
|------|--------|
| `src/ssr.ts` | Replaced `escapeHtml()` with `escapeStyleText()` for bodyStyle (line 95) |

## Review Issues Fixed
None outstanding.

## Notes
This change predates the audit and was merged. The OpenSpec lifecycle was incomplete (no verify-report.md) — this file closes the gap.