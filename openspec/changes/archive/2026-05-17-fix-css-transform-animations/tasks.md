# Tasks: Fix CSS Transform Animations

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260-380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add composed transform contract, public hook wiring, tests, and migration docs | PR 1 | Keep runtime, SSR, docs, and verification together |

## Phase 1: RED / Foundations

- [x] 1.1 RED: In `tests/commit.test.ts`, update layout transform expectations to `translate(... ) var(--animation-transform)` for full commit, apply ops, portal `cssManaged:false`, and hydration cases.
- [x] 1.2 RED: Add failing tests in `tests/commit.test.ts` for synchronous `onTransformConflict`, preserved non-animated layout math, and `transform: ... !important` override behavior from the spec scenarios.
- [x] 1.3 Define `TransformConflictHook` / commit option types in `src/core/types.ts`, then re-export them from `src/index.ts` without breaking existing public APIs.

## Phase 2: Core Runtime Implementation

- [x] 2.1 In `src/render/commit.ts`, add a composed-transform helper plus private ownership tracking for the last Axiom-written transform.
- [x] 2.2 In `src/render/commit.ts`, update `applyFrameworkLayout` to detect conflicting inline transforms, call `onTransformConflict` synchronously, and skip overwriting `transform` when priority is `important`.
- [x] 2.3 In `src/app.ts`, thread `onTransformConflict` through full, incremental, and hydration commit paths using the shared commit option shape.

## Phase 3: SSR / Integration / GREEN

- [x] 3.1 Update `src/ssr.ts` so server-rendered layout styles emit the same composed transform contract and avoid hydration drift.
- [x] 3.2 GREEN: Expand `tests/commit.test.ts` integration coverage so `createApp({ onTransformConflict })` receives `(element, animationTransform)` in the same commit call stack.
- [x] 3.3 Verify transformed elements without animation still preserve existing x/y/width/height behavior in the targeted commit suite.

## Phase 4: Docs / Verification / Refactor

- [x] 4.1 Create `docs/ANIMATIONS.md` documenting migration from `transform` keyframes to `--animation-transform`, plus manual browser checks for `fill-mode: both|forwards`.
- [x] 4.2 Run `bun test tests/commit.test.ts` first, then `bun test` to confirm no regressions in commit, portal, and hydration flows.
- [x] 4.3 REFACTOR: Remove temporary test scaffolding or duplicate helpers, then mark completed items in `openspec/changes/fix-css-transform-animations/tasks.md` during `sdd-apply`.
