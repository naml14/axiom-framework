# Proposal: Add Security Headers to Demo SSR Page

## Intent

The SSR demo page handler in `demo/ssr-page.tsx` returns HTML responses without security headers, while the same demo's `server.ts` and the framework's own `src/server.ts` already apply `SECURITY_HEADERS` to their responses. This inconsistency leaves the SSR demo endpoint vulnerable to clickjacking, MIME-type sniffing, and other common web attacks.

## Scope

### In Scope
- Add `SECURITY_HEADERS` constant to `demo/ssr-page.tsx`
- Merge headers into the SSR Response (spread into existing headers)

### Out of Scope
- Refactoring `demo/server.ts` to extract headers to a shared module
- Adding CORS headers (SSR is served locally)
- Updating `scripts/templates/dev-server.ts` template
- Adding tests (out of scope for this minimal change)

## Capabilities

### New Capabilities
None — this is a bug fix, not a new capability.

### Modified Capabilities
None — no spec-level requirements change.

## Approach

Define `SECURITY_HEADERS` directly in `demo/ssr-page.tsx` using the same values as `demo/server.ts` (line 85–91):

```ts
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
}
```

Then spread into the Response at line 276–278:

```ts
return new Response(html, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
})
```

This is a ~5-line change. Duplication is bounded to a single demo file and acceptable for the current scope.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `demo/ssr-page.tsx` | Modified | Add constant + spread headers |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CSP blocking inline scripts in SSR output | Low | SSR output is server-rendered HTML, not client-side scripts — `script-src 'self'` is safe |
| X-Frame-Options SAMEORIGIN blocking dev iframes | Low | Acceptable for production; dev can override if needed |
| Header duplication with server.ts | Low | Bounded to one file; can be extracted to `demo/headers.ts` later |

## Rollback Plan

Revert the single commit that modifies `demo/ssr-page.tsx`. No config changes, no external dependencies, no migration needed.

## Dependencies

None.

## Success Criteria

- [ ] SSR responses include all 5 security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP, Permissions-Policy)
- [ ] Demo SSR page renders correctly with no console errors
- [ ] Content-Type header still present and correct
