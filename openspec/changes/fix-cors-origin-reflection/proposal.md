# Proposal: Fix CORS Origin Reflection Vulnerability

## Intent

The `corsHeaders()` function in `src/server.ts` (core library), `demo/server.ts` (demo), and `scripts/templates/dev-server.ts` (scaffolding template) reflects any `Origin` request header back as `Access-Control-Allow-Origin` without validation. This allows arbitrary origins to make cross-origin requests — a known CORS misconfiguration. The fix introduces a deny-by-default allowlist pattern: CORS headers are only returned when `allowedOrigins` is explicitly configured.

## Scope

### In Scope
- `src/server.ts`: Add `allowedOrigins?: string[]` to `AxiomServerOptions`, modify `corsHeaders()` to validate against allowlist
- `scripts/templates/dev-server.ts`: Add same inline allowlist logic (standalone file, cannot import from `src/`)
- `demo/server.ts`: Add same inline allowlist logic
- `SECURITY.md`: Document CORS as a consumer responsibility (SSR Threats section)
- Tests for `corsHeaders()` allowlist behavior

### Out of Scope
- Wildcard support (`*`) — explicitly rejected (bad practice, invalid with credentials)
- `allowAllOrigins` dev flag — rejected (users should configure their origins explicitly)
- CORS middleware/plugin — rejected (over-engineered for this use case)
- `Access-Control-Allow-Credentials` support — out of scope for this fix
- Version bump — handled separately by maintainers (breaking change)

## Capabilities

### Modified Capabilities
- None — this is a security fix, not a new capability. No spec-level capability definitions exist for CORS.

## Approach

Deny-by-default allowlist:

1. **`AxiomServerOptions`** — add `allowedOrigins?: string[]`
2. **`corsHeaders(req, allowedOrigins?)`** — if `allowedOrigins` is provided and `origin` is in the list, reflect it; otherwise return `{}`
3. **Origin validation** — reject malformed origins (e.g., `http://`, `not-a-url`) by wrapping each candidate in `URL()` constructor before comparison
4. **Template & demo** — same logic, inline (no shared utility; template is standalone)
5. **SECURITY.md** — add CORS section under SSR Threats, document consumer responsibility

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/server.ts` | Modified | Add `allowedOrigins` option; modify `corsHeaders()` to validate |
| `scripts/templates/dev-server.ts` | Modified | Add same allowlist logic inline |
| `demo/server.ts` | Modified | Add same allowlist logic inline |
| `SECURITY.md` | Modified | Document CORS as consumer responsibility |
| `src/server.test.ts` | New | Tests for allowlist behavior |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking change for existing users | High | Clear migration guide; document in CHANGELOG; major version bump |
| Template ships vulnerable code | Medium | Fix template first — it propagates to new projects |
| `Array.includes()` on every request | Low | Negligible for reasonable lists (<100 origins) |
| Consumers forget to configure | Medium | Deny-by-default is safe; empty CORS = no cross-origin, which is correct |

## Rollback Plan

1. Revert the 3 file changes (`src/server.ts`, `demo/server.ts`, `scripts/templates/dev-server.ts`)
2. Revert `SECURITY.md` changes
3. If deployed: rollback to previous version; note that existing users had no protection regardless

## Dependencies

- None

## Success Criteria

- [ ] `corsHeaders()` returns `{}` when `allowedOrigins` is not provided
- [ ] `corsHeaders()` reflects origin only when it matches an entry in `allowedOrigins`
- [ ] Malformed origins (`http://`, `not-a-url`, empty string) are rejected
- [ ] Template and demo servers have identical behavior
- [ ] SECURITY.md documents CORS as consumer responsibility
- [ ] Tests cover: no-config, single-origin, multi-origin, malformed-origin, empty-origin cases
