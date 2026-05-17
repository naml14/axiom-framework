# Tasks: Document Breakpoints Container Query

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-220 |
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
| 1 | Publish the canonical spec and align docs/comments | PR 1 | Keep spec, source comments, cookbook example, and verification together |

## Phase 1: Foundation

- [x] 1.1 Review `openspec/changes/document-breakpoints-container-query/proposal.md`, `design.md`, and `specs/responsive-breakpoints/spec.md`; map each requirement to a target file.
- [x] 1.2 Create `openspec/specs/responsive-breakpoints.md` documenting container-width breakpoint resolution, `vw`/`vh` fallback, and additive breakpoint precedence.

## Phase 2: Core Documentation Updates

- [x] 2.1 Add a spec-reference comment near `resolveAt()` / `at` normalization in `src/syntax/h.ts`.
- [x] 2.2 Add a spec-reference comment near responsive matching and `vw`/`vh` fallback logic in `src/render/strategy/responsive.ts`.
- [x] 2.3 Update `docs/COOKBOOK.md` with an `at: { sm, md, lg }` recipe that explains container-width behavior.

## Phase 3: Verification

- [x] 3.1 Review `openspec/specs/responsive-breakpoints.md` against the three scenarios in `openspec/changes/document-breakpoints-container-query/specs/responsive-breakpoints/spec.md`.
- [x] 3.2 Diff-check `src/syntax/h.ts` and `src/render/strategy/responsive.ts` to confirm comment-only edits, with no executable logic changes.
- [x] 3.3 Run `bun test tests/responsive.test.ts tests/syntax/snapshots.test.ts` only if the source edits touch behavior-sensitive lines.

## Phase 4: Cleanup

- [x] 4.1 Normalize wording across `openspec/specs/responsive-breakpoints.md` and `docs/COOKBOOK.md` to use "container query" / "container width", not viewport-media-query language.
- [x] 4.2 During `sdd-apply`, mark completed checklist items in this file and keep verification evidence with the same work unit.

## Phase 5: Missing Tests (post-verify addition)

- [x] 5.1 Add test for container-query resolution: breakpoint triggers at container width, not viewport (`tests/responsive.test.ts`).
- [x] 5.2 Add test for `vw` fallback without `viewportWidth` (`tests/responsive.test.ts`).
