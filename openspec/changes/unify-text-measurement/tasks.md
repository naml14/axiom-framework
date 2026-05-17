# Tasks: Unify Text Measurement

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~80 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | single PR |

## Phase 1: Create shared helper

- [x] 1.1 Create `src/render/engines/text-measure.ts` with `measureTextChild`
- [x] 1.2 Refactor `src/render/engines/fast-path.ts` to use shared helper
- [x] 1.3 Refactor `src/render/engines/flex.ts` to use shared helper
- [x] 1.4 Refactor `src/render/engines/grid.ts` to use shared helper
- [x] 1.5 Verify tests pass: `bun test`
