# Design: Fix CORS Origin Reflection Vulnerability

## Technical Approach

Replace the current "reflect any Origin" behavior with a deny-by-default allowlist. When `allowedOrigins` is not provided, `corsHeaders()` returns `{}`. When provided, only origins that pass `URL()` validation and match an entry in the list are reflected.

## Architecture Decisions

### Decision: Inline CORS Logic in Template and Demo

**Choice**: Copy the fixed `corsHeaders()` logic into `scripts/templates/dev-server.ts` and `demo/server.ts` instead of creating a shared `src/server/cors.ts` utility.

**Alternatives considered**:
- Shared module: Would require the template (which is standalone — no imports from `src/`) to copy the file or use a relative path.
- Plugin-based CORS: Over-engineered; the plugin system is experimental.

**Rationale**: The template is distributed to new projects as a standalone file. It cannot import from `src/` without changing the project structure. Duplication is acceptable for a ~10-line function.

### Decision: Optional `allowedOrigins` (Not Required)

**Choice**: `allowedOrigins?: string[]` — omitting it disables CORS entirely (deny by default).

**Alternatives considered**:
- `allowAllOrigins: boolean`: Would keep the vulnerable behavior; explicitly rejected in the proposal.
- Required field: Would force every user to configure, but provides no benefit over deny-by-default.

**Rationale**: Deny-by-default is the safest posture. Existing users who relied on the old behavior lose CORS — a breaking change that necessitates a major version bump.

### Decision: Reject Wildcards Explicitly

**Choice**: `*` is not a valid origin — it will never match via `includes()`, and the `URL()` validation will reject it.

**Rationale**: Wildcard `Access-Control-Allow-Origin` is invalid with credentials (RFC 6454). No need for special-case rejection logic.

## Data Flow

```
Request ──→ corsHeaders(req, options.allowedOrigins)
                    │
                    ├─ origin = req.headers.get('Origin') ?? ''
                    ├─ if origin === '' → return {}
                    ├─ if !allowedOrigins → return {}
                    ├─ URL(origin) throws → return {}
                    ├─ origin ∉ allowedOrigins → return {}
                    └─ match → return { 'Access-Control-Allow-Origin': origin, ... }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/server.ts` | Modify | Add `allowedOrigins?: string[]` to `AxiomServerOptions`; modify `corsHeaders()` signature and logic |
| `scripts/templates/dev-server.ts` | Modify | Copy fixed `corsHeaders()` with inline allowlist |
| `demo/server.ts` | Modify | Copy fixed `corsHeaders()` with inline allowlist |
| `SECURITY.md` | Modify | Add CORS section under SSR Threats |
| `tests/server.test.ts` | Modify | Add CORS allowlist tests |

## Interfaces / Contracts

### `AxiomServerOptions` (src/server.ts)

```ts
export interface AxiomServerOptions {
  routes: Array<{
    path: string
    component: ComponentDefinition<void>
    metadata?: SSRMetadata
  }>
  staticDir?: string
  port?: number
  ssr?: StreamSSROptions
  allowedOrigins?: string[]  // NEW
}
```

### `corsHeaders()` — Core Library

```ts
function corsHeaders(req: Request, allowedOrigins?: string[]): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (origin === '' || !allowedOrigins?.includes(origin)) return {}
  try {
    new URL(origin)
  } catch {
    return {}
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}
```

### `corsHeaders()` — Template & Demo (inline)

Identical logic, same function name, no shared import.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | No-config → no CORS headers | `corsHeaders(req)` without `allowedOrigins` |
| Unit | Single origin match | `allowedOrigins: ['https://example.com']` → match |
| Unit | Non-matching origin | `allowedOrigins: ['https://example.com']`, `Origin: https://other.com` → no headers |
| Unit | Malformed origin | `Origin: http://` → no headers (URL throws) |
| Unit | Empty origin | `Origin: ''` → no headers |
| Unit | Wildcard origin | `allowedOrigins: ['*']` → no match |
| Integration | Server responds with CORS on valid origin | Full `createServer()` flow |
| Integration | Server denies CORS on invalid origin | Full `createServer()` flow |

## Migration / Rollout

**Breaking change** — requires major version bump.

1. Document migration in CHANGELOG: add `allowedOrigins: ['https://your-domain.com']` to `createServer()` options.
2. Fix template first — new projects scaffolded before the fix will inherit the vulnerability.
3. Demo server fix is cosmetic (demo only) but should be included for consistency.

## Open Questions

- [ ] Should the template include a default `allowedOrigins` for local development (e.g., `['http://localhost:5173']`)? — **Decision**: No. Consumers should configure explicitly.

## Artifacts

- `openspec/changes/fix-cors-origin-reflection/design.md` — this file
