## Exploration: fix-cors-origin-reflection

### Current State

The axiom-framework library has three copies of an identical `corsHeaders()` function that reflects the `Origin` request header back as `Access-Control-Allow-Origin` without any validation:

| File | Role |
|------|------|
| `src/server.ts:81-90` | **Core library** — exported `createServer()` uses this for all SSR + static responses |
| `demo/server.ts:44-53` | Demo application — standalone Bun server |
| `scripts/templates/dev-server.ts:112-121` | Template for `create-axiom` scaffolding — copied to new projects |

The vulnerability: any attacker-controlled `Origin` header is echoed back verbatim. This means:
- A malicious origin can make cross-origin requests to the Axiom server
- The reflected origin is used for **every** response type (204 preflight, static files, SSR routes, 404, 429)
- The `Vary: Origin` header is present (correct) but doesn't mitigate the reflection

The framework already has security-conscious patterns:
- `SECURITY_HEADERS` defined in all three locations (X-Frame-Options, CSP, Permissions-Policy, etc.)
- Rate limiting (`getRateLimiter()`)
- Path traversal protection (`isPathInside()` / `resolveStaticFilePath()`)
- XSS protections documented in `SECURITY.md`

However, CORS is **not** documented in `SECURITY.md` and has **no tests**.

---

### Affected Areas

| File | Why affected |
|------|--------------|
| `src/server.ts` | Core library — the primary fix target. `corsHeaders()` is called on every response path (lines 154, 161, 170, 183, 189). |
| `demo/server.ts` | Demo app — must be fixed for consistency, but lower priority (demo only). |
| `scripts/templates/dev-server.ts` | Scaffolding template — must be fixed so new projects inherit the vulnerability. |
| `SECURITY.md` | Should document CORS as a consumer responsibility (SSR Threats section). |
| `src/index.ts` | If a new `allowedOrigins` option is added to `AxiomServerOptions`, it needs re-export. |

---

### Approaches

#### 1. Origin Allowlist in `AxiomServerOptions` ✅ RECOMMENDED

Add an optional `allowedOrigins` array to `AxiomServerOptions`. If provided, only origins in the list are reflected. If omitted, **no CORS headers are returned** (deny by default).

```ts
export interface AxiomServerOptions {
  // ... existing fields
  allowedOrigins?: string[]  // new
}

function corsHeaders(req: Request, allowedOrigins?: string[]): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (origin === '' || !allowedOrigins?.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}
```

**Pros:**
- **Deny-by-default**: safest possible — no CORS unless explicitly configured
- **Minimal API surface**: one optional array field
- **Backward-compatible**: existing code that doesn't pass `allowedOrigins` gets no CORS (safe)
- **Framework-level fix**: fixing `src/server.ts` fixes the library; consumers can add their own logic
- **Matches framework security pattern**: follows the same style as `SECURITY_HEADERS` (explicit opt-in)

**Cons:**
- **Breaking change for existing users**: anyone relying on the current behavior loses CORS unless they add `allowedOrigins`
- **No wildcard support**: `*` is not allowed in `Access-Control-Allow-Origin` for credentialed requests, and wildcard is bad practice anyway
- **Must fix all three copies**: template and demo need the same fix

**Effort:** Medium — one option field + validation logic in 3 locations.

---

#### 2. Origin Allowlist via Middleware/Plugin

Add a CORS plugin that consumers can register. The library ships with a restrictive default.

**Pros:**
- Non-breaking (default is restrictive)
- Flexible per-consumer configuration

**Cons:**
- Over-engineered for a simple allowlist
- Plugin system is experimental (see `SECURITY.md` — experimental APIs may change)
- Adds complexity to a simple feature

**Effort:** High — requires plugin infrastructure changes.

---

#### 3. `corsOptions` Object with Multiple Fields

Add a structured `corsOptions` object with `allowedOrigins`, `allowedMethods`, `allowedHeaders`, `credentials`, etc.

**Pros:**
- Complete CORS configuration surface
- Future-proof

**Cons:**
- Over-engineered: the current implementation only has 4 headers
- Higher cognitive load for consumers
- Unnecessary complexity for a simple fix

**Effort:** High — more fields to design, document, and maintain.

---

#### 4. Shared Utility Function

Extract `corsHeaders` into a shared module (e.g., `src/server/cors.ts`) and import it in all three locations.

**Pros:**
- Eliminates code duplication
- Single source of truth for CORS logic

**Cons:**
- The template (`dev-server.ts`) is a standalone file — it doesn't import from `src/`
- The demo server also imports from `src/` but uses Bun directly
- Adding a shared utility creates a new dependency path that must be maintained

**Effort:** Medium — refactor + update all consumers.

---

### Recommendation

**Approach 1** (optional `allowedOrigins` array in `AxiomServerOptions`, deny-by-default) combined with **Approach 4** (shared utility for the core library only) is the best path.

**Why:**
1. The vulnerability is in the **core library** (`src/server.ts`), which is the most important fix. The fix should be: deny CORS unless explicitly configured.
2. The **template** (`scripts/templates/dev-server.ts`) must also be fixed because it's distributed to new projects. Since it's a standalone file, it cannot import from `src/` — it needs its own copy of the fixed logic.
3. The **demo** (`demo/server.ts`) should be fixed for consistency but is lower priority.

**Implementation plan:**

1. Add `allowedOrigins?: string[]` to `AxiomServerOptions` in `src/server.ts`
2. Modify `corsHeaders()` to validate origin against the allowlist
3. Fix `scripts/templates/dev-server.ts` with the same logic (inline, since it's standalone)
4. Fix `demo/server.ts` with the same logic (inline, since it's standalone)
5. Add `SECURITY.md` documentation about CORS
6. Add tests for the new behavior

---

### Risks

- **Breaking change**: Existing users of `createServer()` who rely on CORS will see it break. Must be a **major version bump** (0.9.x → 1.0.0) or at minimum a **minor version bump** with a clear migration guide.
- **Template propagation**: The `create-axiom` template ships with the vulnerable code. Every new project scaffolded before this fix is applied will inherit the vulnerability. The template fix should be **prioritized** over the demo.
- **No wildcard**: Some users may want `allowedOrigins: ['*']` for development. This is a bad pattern (CORS wildcard + credentials is invalid), but we should document this clearly and possibly offer a `allowAllOrigins: boolean` flag for local development only.
- **Performance**: `Array.includes()` on every request is negligible for reasonable lists (<100 origins). No concern.
- **Edge cases**: Origin header validation — malformed origins (e.g., `http://` without host, `not-a-url`) should be rejected. The `includes()` check handles this implicitly (they won't match any valid origin in the list).

---

### Next Steps for Proposal

1. **Clarify**: Should `allowedOrigins` be required or optional? (Recommendation: optional, deny-by-default)
2. **Clarify**: Should we add `allowAllOrigins: boolean` for local dev? (Recommendation: no — document that users should just configure their origins)
3. **Clarify**: Version bump plan — this is a breaking change (security fix)
4. **Write proposal** with scope, approach, and migration guide
5. **Write spec** with acceptance criteria for the allowlist behavior

---

### Ready for Proposal

Yes. The vulnerability is well-understood, the fix approach is clear (deny-by-default allowlist), and the scope is small (3 files + docs + tests). The main decision remaining is the exact API shape of `allowedOrigins` and whether to include a dev-friendly `allowAllOrigins` flag.
