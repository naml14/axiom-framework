# Tasks: Fix CORS Origin Reflection Vulnerability

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~95 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core library fix + template & demo parity | PR 1 | base: main; includes tests |
| 2 | SECURITY.md documentation | PR 1 | same PR — small, review-friendly |

## Phase 1: Foundation — Core Library

- [x] 1.1 Add `allowedOrigins?: string[]` to `AxiomServerOptions` in `src/server.ts` (line 14–23)
- [x] 1.2 Rewrite `corsHeaders(req, allowedOrigins?)` in `src/server.ts` (line 81–90):
  - Return `{}` if `origin === ''` or `allowedOrigins` is not provided
  - Validate each candidate with `URL()` constructor — reject on `TypeError`
  - Return CORS headers only when origin matches an entry in `allowedOrigins`
  - Update all call sites in `createServer()` to pass `options.allowedOrigins`

## Phase 2: Template & Demo Parity

- [x] 2.1 Update `demo/server.ts` — replace `corsHeaders()` (line 44–53) with the same allowlist logic, accepting `allowedOrigins` parameter and adding `const ALLOWED_ORIGINS = ['http://localhost:3000']`
- [x] 2.2 Update `scripts/templates/dev-server.ts` — replace `corsHeaders()` (line 112–121) with the same allowlist logic; add `const ALLOWED_ORIGINS = ['http://localhost:5173']` for local dev

## Phase 3: Security Documentation

- [x] 3.1 Add CORS Origin Reflection section to `SECURITY.md` under SSR Threats (after line 133):
  - Explain the vulnerability (reflecting any Origin)
  - Document that consumers must configure `allowedOrigins`
  - Provide example configuration
  - Note that omitting the config disables CORS (deny-by-default)

## Phase 4: Testing

- [x] 4.1 Create `tests/server.test.ts` with the following test scenarios:
  - No `allowedOrigins` → `corsHeaders()` returns `{}`
  - Valid origin matches → returns CORS headers
  - Origin not in allowlist → returns `{}`
  - Malformed origin (`http://`, `not-a-url`, empty string) → returns `{}`
  - Wildcard `*` in allowlist → never matches
  - Multiple origins in allowlist → only matching one is reflected
