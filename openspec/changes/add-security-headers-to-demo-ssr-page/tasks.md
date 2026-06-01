# Tasks: Add Security Headers to Demo SSR Page

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~13 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Implementation

- [x] 1.1 Add `SECURITY_HEADERS` constant object to `demo/ssr-page.tsx` with headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy`, `Permissions-Policy`
- [x] 1.2 Merge `SECURITY_HEADERS` into the `Response` headers in `renderSSRPage` alongside the existing `Content-Type` header
- [x] 1.3 Verify the build succeeds (`bun test`) and the demo server runs with the new headers

## Phase 2: Verification

- [x] 2.1 Start the demo server and hit `/ssr` endpoint, confirm all 5 security headers appear in the response
- [x] 2.2 Verify headers are correctly merged (no duplicates, no conflicts with Content-Type)
