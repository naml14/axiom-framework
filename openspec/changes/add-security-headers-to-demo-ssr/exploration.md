# Exploration: Add Security Headers to Demo SSR Page

## Current State

The SSR demo page handler in `demo/ssr-page.tsx:276-278` returns HTML with only a `Content-Type` header:

```ts
return new Response(html, {
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
})
```

Meanwhile, `demo/server.ts:85-91` defines `SECURITY_HEADERS` with five headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP, Permissions-Policy) and applies them to static file responses at line 130, but **not** to the SSR response.

The framework's own `src/server.ts:113-119, 200` already applies `SECURITY_HEADERS` to its SSR responses — so the framework is secure, but the demo is not.

The template `scripts/templates/dev-server.ts:93-99` also defines `SECURITY_HEADERS` but doesn't apply them to all response types.

## Affected Areas

- `demo/ssr-page.tsx` — the SSR handler that needs the fix
- `demo/server.ts` — the entry point (already has SECURITY_HEADERS)

## Other SSR-like Pages

No other SSR-like pages exist. `src/server.ts` is the framework's production SSR handler (already secured). The template in `scripts/templates/dev-server.ts` is a starter template, not a demo page.

## Approaches

### 1. Define SECURITY_HEADERS in ssr-page.tsx (Recommended)

Add the `SECURITY_HEADERS` constant directly in `demo/ssr-page.tsx` and merge it into the Response headers.

- **Pros**: Minimal change, no module restructuring, no circular dependency risk
- **Cons**: Duplicates the constant (two copies of the same definition)
- **Effort**: Low (~5 lines)

### 2. Extract to shared `demo/headers.ts`

Create `demo/headers.ts` with `SECURITY_HEADERS` and import it from both `server.ts` and `ssr-page.tsx`.

- **Pros**: Single source of truth, follows DRY
- **Cons**: Adds a new file, changes module structure
- **Effort**: Medium (3 files to touch)

### 3. Pass headers from server.ts

Have `server.ts` call `renderSSRPage(url, headers)` and pass the headers object.

- **Pros**: Keeps security policy in one place (server.ts)
- **Cons**: Changes function signature, couples handler to transport layer
- **Effort**: Medium

### 4. Apply headers at the server level

Move the SSR route into `server.ts` and apply headers there before returning.

- **Pros**: Headers applied at the transport layer, consistent with static files
- **Cons**: Moves business logic out of the handler, breaks the handler abstraction
- **Effort**: Low-Medium

## Recommendation

**Approach 1** — define `SECURITY_HEADERS` in `demo/ssr-page.tsx`. The change is tiny (one constant + one spread), and the duplication is bounded to a single demo file. If the project later consolidates security headers across all demos, Approach 2 becomes natural.

The fix in `demo/ssr-page.tsx:276-278`:

```ts
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
}

return new Response(html, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
})
```

## Risks

- **CSP blocking the demo**: The `script-src 'self'` policy may block inline scripts if the SSR output includes them. However, the SSR output is server-rendered HTML, not client-side scripts, so this should be fine.
- **X-Frame-Options SAMEORIGIN**: If the demo is embedded in an iframe during development, this will block it. This is acceptable for production but worth noting for dev workflows.
- **No CORS headers**: The SSR response doesn't include CORS headers. Since this is a demo served locally, this is likely not an issue, but worth mentioning.

## Ready for Proposal

Yes. The scope is clear, the fix is minimal, and the risks are low. Next step: write the proposal with scope, approach, and rollback plan.
