# Tasks: Add SSR Hydration Tests

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 140-260 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Ship SSR hydration tests and guide update together | PR 1 | Keep harness, targeted test evidence, and docs in one reviewable slice |

## Phase 1: Foundation

- [x] 1.1 Create `tests/ssr-hydration.test.ts` with local `fakeTextEngine`, `installWindow(html)`, `getHydrationRoot()`, and captured-scheduler helpers mirroring `tests/hydration.test.ts` / `tests/commit.test.ts`.
- [x] 1.2 Keep `src/ssr.ts`, `src/render/commit.ts`, and `src/app.ts` read-only references; do not patch runtime behavior in this change.

## Phase 2: RED

- [x] 2.1 Add a failing `renderToString` → hydrate test in `tests/ssr-hydration.test.ts` for “SSR to Hydration preservation”, asserting SSR markup and hydrated `style.transform` stay `translate(Xpx,Ypx) var(--animation-transform)`.
- [x] 2.2 Add a failing hydration-update test in `tests/ssr-hydration.test.ts` for “Hydration update causes transform conflict”, capturing `onTransformConflict` after an external `scale(...)` write.

## Phase 3: GREEN

- [x] 3.1 Complete the hydrate/update setup in `tests/ssr-hydration.test.ts` so both scenarios pass using `happy-dom`, `createApp({ hydrate: true })`, and the captured scheduler only.
- [x] 3.2 Assert literal strings only: no computed-style or CSS `var()` resolution checks, and clear baseline conflict calls before the post-hydration update assertion.

## Phase 4: Verification and Docs

- [x] 4.1 Run `bun test tests/ssr-hydration.test.ts` and `bun test tests/hydration.test.ts tests/commit.test.ts` for integration safety.
- [x] 4.2 Update `docs/TESTING-GUIDE.md` with an “SSR/Hydration Testing” section covering `renderToString` + hydrate flow, happy-dom limits, and literal transform assertions.
- [x] 4.3 Tasks updated and verification evidence filed.
