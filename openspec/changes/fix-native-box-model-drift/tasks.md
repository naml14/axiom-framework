# Tasks: Fix Native Box-Model Drift

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~40 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | single PR |

## Phase 1: SSR

- [x] 1.1 Add `box-sizing:border-box;margin:0;padding:0;` to SSR style output in `src/ssr.ts`
- [x] 1.2 Update `tests/ssr.test.ts` to assert reset styles

## Phase 2: Hydration

- [x] 2.1 Call `applyFrameworkLayout` in `commitHydrate` for element nodes
- [x] 2.2 Merge user `attrs.style` instead of replacing via `sanitizeHydratedElementAttrs`
- [x] 2.3 Add hydration test: build DOM without SSR, verify layout styles applied
