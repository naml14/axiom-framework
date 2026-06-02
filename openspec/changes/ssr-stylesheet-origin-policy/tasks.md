# Tasks: SSR Stylesheet Origin Policy

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 140-220 |
| Estimated implementation files | 6 |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | Chained (stacked-to-main) |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Shared sanitizer + SSR omission + docs/spec alignment | PR 1 | Keep tests/docs with behavior |

## Phase 1: Artifact Alignment

- [x] 1.1 [M] Update `openspec/changes/ssr-stylesheet-origin-policy/specs/ssr-security/spec.md` so blocked stylesheet scenarios require omission (no `<link>`), not `#blocked`; accept: all dangerous/protocol-relative scenarios match the authoritative contract.

## Phase 2: Shared URL Sanitizer (TDD)

- [x] 2.1 [M] RED in `tests/edge-cases.test.ts`: add coverage for `sanitizeUrlValue()` blocking `javascript:`, `data:`, `vbscript:`, `file:`, `//`, while `sanitizeAttrValue()` still returns `#blocked`; accept: `bun test tests/edge-cases.test.ts`.
- [x] 2.2 [J] GREEN in `src/core/attrs.ts`: extract internal `sanitizeUrlValue(value: string): string`, keep regexes private, and make `sanitizeAttrValue()` map the helper's blocked sentinel to the unchanged public `#blocked` contract; accept: `bun test tests/edge-cases.test.ts`.

## Phase 3: SSR Stylesheet Emission (TDD)

- [x] 3.1 [M] RED in `tests/ssr.test.ts`: add stylesheet cases for relative/HTTPS/HTTP pass, dangerous/protocol-relative omit, escaping preserved, mixed lists, and empty/undefined unchanged; accept: `bun test tests/ssr.test.ts`.
- [x] 3.2 [J] GREEN in `src/ssr.ts`: remove `ALLOWED_STYLESHEET_ORIGIN`, sanitize each stylesheet before `escapeHtml()`, emit `<link rel="stylesheet">` only for safe hrefs, omit blocked ones; accept: `bun test tests/ssr.test.ts`.

## Phase 4: Docs and Final Verification

- [x] 4.1 [M] Update `SECURITY.md` External Stylesheet SSRF guidance to state Axiom blocks dangerous schemes/protocol-relative URLs, while CSP `style-src` and consumer host validation remain the origin-enforcement layer; accept: section mentions both framework floor and CSP guidance.
- [x] 4.2 [M] Run full verification: `bun test` and `bunx tsc --noEmit`; accept: full suite green and typecheck clean.
