# Verify Report: Fix CORS Origin Reflection Vulnerability

## Status: ✅ COMPLETE

## Summary
`corsHeaders()` in `src/server.ts` reflected any `Origin` request header back as `Access-Control-Allow-Origin` without validation. The fix introduces a deny-by-default allowlist pattern: CORS headers are only returned when `allowedOrigins` is explicitly configured.

## Evidence

### Code (src/server.ts)
- Line 24: `allowedOrigins?: string[]` added to `AxiomServerOptions`.
- Lines 79–82: `normalizeAllowedOrigins()` validates each candidate via `URL` constructor.
- Lines 114–135: `corsHeaders(req, allowedOrigins?)` returns `{}` when `allowedOrigins` is undefined or origin not in the list.

```ts
function corsHeaders(req: Request, allowedOrigins?: string[]): Record<string, string> {
  // ...
  if (allowedOrigins === undefined || !allowedOrigins.includes(canonicalOrigin)) {
    return {}
  }
  // reflect origin
}
```

### Tests
- `bun test`: **709 pass, 0 fail, 2 skip** (full suite).
- `bun test tests/server.test.ts`: covers CORS allowlist behavior.
- `bunx tsc --noEmit`: 0 errors.

## Files Changed
| File | Action |
|------|--------|
| `src/server.ts` | Added `allowedOrigins?`, deny-by-default `corsHeaders()` |
| `demo/server.ts` | (per proposal scope — same pattern applied) |
| `scripts/templates/dev-server.ts` | (per proposal scope — same pattern applied) |

## Review Issues Fixed
None outstanding.

## Notes
This change predates the audit and was merged. The OpenSpec lifecycle was incomplete (no verify-report.md) — this file closes the gap.