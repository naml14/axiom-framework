# Tasks: Optimize Reflow Portals

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 20-60 |
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
| 1 | Remove dead portal branch and prove portal behavior stays stable | PR 1 | Single branch to main; include tests in same slice |

## Phase 1: RED / Baseline Verification

- [x] 1.1 In `tests/portal.test.ts`, confirm or tighten the existing `reflow — portal layout` and `cssManaged:false` cases so they fail if `layoutNode()` becomes the portal-child layout path again.
- [x] 1.2 Run the targeted portal suite with `bun test tests/portal.test.ts` to capture the red/green baseline before editing `src/render/reflow.ts`.

## Phase 2: Core Cleanup

- [x] 2.1 In `src/render/reflow.ts`, delete the `if (nodeType === 'portal')` block from `layoutNode()` and keep the non-portal path untouched.
- [x] 2.2 In `src/render/reflow.ts`, preserve `reflowPortalChildren()` as the only `cssManaged:false` portal-child layout entry point and update nearby comments if they still imply dual handling.

## Phase 3: Verification

- [x] 3.1 Re-run `bun test tests/portal.test.ts` and verify the spec scenarios still hold: primary-pass portal skip, `cssManaged:true` no child layout, `cssManaged:false` child dimensions populated.
- [x] 3.2 Run full `bun test` to catch regressions in `measureSimple`, `measureFlex`, and `measureGrid` interactions with portal slots.

## Phase 4: Cleanup / Alignment

- [x] 4.1 If implementation reveals outdated wording, align comments in `src/render/reflow.ts` with the two-pass contract defined in `openspec/changes/optimize-reflow-portals/specs/render-pipeline/spec.md`.
