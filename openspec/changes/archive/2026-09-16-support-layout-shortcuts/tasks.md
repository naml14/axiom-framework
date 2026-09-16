# Tasks: Support Layout Shortcuts

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~60 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | single PR |

## Phase 1: Core types

- [x] 1.1 Add `'space-around'` to `JustifyContent` in `src/core/types.ts`
- [x] 1.2 Add `'baseline'` to `AlignItems` in `src/core/types.ts`
- [x] 1.3 Export `VALID_JUSTIFY_VALUES` and `VALID_ALIGN_VALUES` from `src/core/types.ts`

## Phase 2: Engine implementation

- [x] 2.1 Implement `space-around` in `flex.ts` (with gap fix)
- [x] 2.2 Implement `baseline` as center in `getCrossOffset`
- [x] 2.3 Update `src/syntax/h.ts` validation to use exported arrays

## Phase 3: Tests

- [x] 3.1 Add reflow tests: space-around, baseline
- [x] 3.2 Add h.test.ts validation tests
- [x] 3.3 Add layout.test.ts shortcut tests
- [x] 3.4 Add syntax-h.test-d.ts type tests
