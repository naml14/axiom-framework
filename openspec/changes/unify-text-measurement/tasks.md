# Tasks: Unify Text Measurement

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-280 |
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
| 1 | Shared text measurement helper plus engine adoption and tests | PR 1 | Single reviewable slice; include tests with code |

## Phase 1: Foundation

- [x] 1.1 RED: Add helper-focused expectations in `tests/reflow.test.ts` for wrapped text height parity across root reflow, fast-path stack, flex, and grid scenarios from the spec.
- [x] 1.2 Create `src/render/engines/text-measure.ts` exporting `FontData` and pure `measureTextChild(text, font, wordWrap)` with shared `charWidth=8` and `wordWrapFactor=1.4`.
- [x] 1.3 GREEN: Cover helper math in `tests/reflow.test.ts`, including wrapped text height and empty-text guard behavior required by the design.

## Phase 2: Core Implementation

- [x] 2.1 Update `src/render/reflow.ts` so `layoutText` resolves text locally, delegates size calculation to `measureTextChild`, and preserves existing `LayoutResult` writes.
- [x] 2.2 Update `src/render/engines/fast-path.ts` to replace its private text formula with the shared helper without changing non-text positioning paths.
- [x] 2.3 Update `src/render/engines/flex.ts` to remove duplicated `measureTextChild` math and call `src/render/engines/text-measure.ts` instead.
- [x] 2.4 Update `src/render/engines/grid.ts` to remove duplicated `measureTextChild` math and call the shared helper with the existing text extraction flow.

## Phase 3: Verification

- [x] 3.1 GREEN: Expand `tests/reflow.test.ts` assertions so identical wrapped text produces the same height in stack, flex, and grid paths, matching the spec scenarios.
- [x] 3.2 REFACTOR: Keep existing non-text assertions in `tests/reflow.test.ts` intact and adjust fixtures only where shared text height changes are expected.
- [x] 3.3 Run `bun test tests/reflow.test.ts`, then `bun test`, to prove unified text math does not regress unrelated layout behavior.

## Phase 4: Cleanup

- [x] 4.1 Remove obsolete local measurement helpers/imports from `src/render/engines/fast-path.ts`, `src/render/engines/flex.ts`, and `src/render/engines/grid.ts` after tests pass.
- [x] 4.2 Update `openspec/changes/unify-text-measurement/tasks.md` checklist status during `sdd-apply` as each task lands.
