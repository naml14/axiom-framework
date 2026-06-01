# Tasks: Fix CSS Injection via bodyStyle Metadata

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~55 (2 add + 53 add) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Code fix + tests + docs | PR 1 (main) | Self-contained; all three concerns in one PR |

## Phase 1: Code Fix

- [ ] 1.1 Replace `escapeHtml(options.metadata.bodyStyle)` with `escapeStyleText(options.metadata.bodyStyle)` on line 95 of `src/ssr.ts`
  - **Verify**: `escapeStyleText()` already exists at line 236 and blocks `url(`, `@import`, `expression(`, `behavior:`, `javascript:`
  - **Verify**: No other callers of `escapeHtml` on `bodyStyle` exist in the codebase
  - **Verify**: Existing SSR tests still pass after the swap

## Phase 2: Test Coverage

- [ ] 2.1 Add test case in `tests/ssr.test.ts` verifying `bodyStyle` sanitization against CSS injection payloads
  - Test that `url(data:...)` is stripped from output
  - Test that `@import url(...)` is stripped from output
  - Test that `expression()` is stripped from output
  - Test that `javascript:` is stripped from output
  - Test that legitimate CSS (`color: red; font-weight: bold;`) is preserved
  - **Verify**: New test passes; existing `tests/ssr.test.ts` tests still pass

## Phase 3: Documentation

- [ ] 3.1 Add `bodyStyle` threat entry under "SSR Threats (Server)" in `SECURITY.md` (after the existing "Inline Styles Injection" section)
  - Document that `bodyStyle` content is CSS-sanitized via `escapeStyleText()`
  - Document the remaining risk: CSS property values are not sanitized (same as `inlineStyles`)
  - Match the pattern used for the existing `inlineStyles` entry
- [ ] 3.2 Add a note in `docs/SSR-HYDRATION-CONTRACT.md` on line 118 where `bodyStyle` is documented
  - Add: "Content is CSS-sanitized via `escapeStyleText()` before rendering"

## Implementation Order

1. **Code fix first** (Phase 1) — the single-line change is the core deliverable
2. **Tests second** (Phase 2) — verify the fix works before documenting it
3. **Docs last** (Phase 3) — update SECURITY.md and SSR-HYDRATION-CONTRACT.md to reflect the new behavior

## Verification Checklist

- [ ] `bun test tests/ssr.test.ts` passes (all existing + new tests)
- [ ] `bun test` passes (full suite, no regressions)
- [ ] `bodyStyle` with injection payloads produces sanitized output
- [ ] Legitimate `bodyStyle` content renders correctly
- [ ] `SECURITY.md` documents `bodyStyle` under SSR Threats
- [ ] `SSR-HYDRATION-CONTRACT.md` notes sanitization
