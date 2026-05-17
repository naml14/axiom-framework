# Apply Progress: add-ssr-hydration-tests

**Mode**: Strict TDD

## Completed Tasks

- [x] 1.1 Created `tests/ssr-hydration.test.ts` with SSR→hydration helpers (`fakeTextEngine`, `installWindow`, captured-scheduler)
- [x] 1.2 Runtime files (`src/ssr.ts`, `src/render/commit.ts`, `src/app.ts`) kept read-only
- [x] 2.1 RED: SSR→hydration transform preservation tests
- [x] 2.2 RED: `onTransformConflict` hook after hydration update test
- [x] 3.1 GREEN: All 6 scenarios pass with `happy-dom` + `createApp({ hydrate: true })` + captured scheduler
- [x] 3.2 GREEN: Literal string assertions only; baseline cleared after mount
- [x] 4.1 `bun test` → 6/6 new tests pass + 629/629 full suite
- [x] 4.2 `docs/TESTING-GUIDE.md` → added section "SSR/Hydration Testing"
- [x] 4.3 Tasks artifact updated with `[x]` marks

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|------------------------|-------|------------|-----|-------|-------------|----------|
| 2.1–2.2 | `tests/ssr-hydration.test.ts` | Integration | ✅ 0/0 (new file) | ✅ Written | ✅ 6/6 pass | ✅ 4 contract + 2 hook cases | ➖ None needed |

## Files Changed

| File | Action |
|-----|--------|
| `tests/ssr-hydration.test.ts` | Created (6 new integration tests) |
| `docs/TESTING-GUIDE.md` | Updated (added Section 10) |

## Deviations from Design
None — implementation matches design.