# Tasks: Fix Native Box Model Drift

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 80-180 |
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
| 1 | Align SSR, hydration, and regression tests for framework-managed layout resets | PR 1 | Single reviewable slice with SSR + hydration + tests |

## Phase 1: Foundation

- [x] 1.1 Update `src/ssr.ts` `renderNode` style assembly to append `box-sizing:border-box;margin:0;padding:0;` before user `attrs.style` for framework-managed nodes only.
- [x] 1.2 Preserve existing exclusions in `src/ssr.ts` so CSS-managed portal children still skip framework layout styles and no `border` reset is introduced.

## Phase 2: Hydration Implementation

- [x] 2.1 Update `src/render/commit.ts` `hydrateNode` to call `applyFrameworkLayout(domEl, { x, y, width, height }, true)` after matching a normal hydrated element and before child traversal.
- [x] 2.2 Keep portal marker and CSS-managed portal handling unchanged in `src/render/commit.ts` so hydration resets apply only to framework-managed elements.

## Phase 3: Verification

- [x] 3.1 Extend `tests/ssr.test.ts` for the spec scenario "SSR Output Generation" to assert the inline style contains `box-sizing:border-box;margin:0;padding:0;` and does not inject a `border` reset.
- [x] 3.2 Extend `tests/hydration.test.ts` or `tests/commit.test.ts` for the spec scenario "Hydrating framework elements" to assert hydrated nodes receive `boxSizing`, `margin`, and `padding` via `commitHydrate`.
- [x] 3.3 Run `bun test` or the project test command covering SSR, hydration, commit, and portal regression paths; capture any failures before apply is marked complete.

## Phase 4: Cleanup

- [x] 4.1 Review the final diff to confirm only `src/ssr.ts`, `src/render/commit.ts`, and targeted tests changed, keeping the fix inside the existing layout contract.
