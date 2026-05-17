# Tasks: Eliminate nextAnonymousId Global

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-320 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Deterministic naming API, tests, and spec caveat alignment | PR 1 | Keep runtime, type tests, and docs in one reviewable slice |

## Phase 1: RED / Contracts

- [ ] 1.1 RED: Extend `tests/component.test.ts` with failing checks for `Component#{8-hex}`, identical-source equality, different-source inequality, and `defineComponent(fn, { name })` precedence.
- [ ] 1.2 RED: Add an SSR/client consistency scenario in `tests/ssr.test.ts` proving equivalent anonymous component definitions resolve to the same display name across render paths.
- [ ] 1.3 RED: Create `tests/types/component.test-d.ts` with `expect-type` coverage for `defineComponent(fn, options?)`, legacy `(name, fn)`, and prop inference retention.

## Phase 2: Core Implementation

- [ ] 2.1 In `src/core/types.ts`, add exported `ComponentOptions { name?: string }` without breaking `ComponentDefinition`.
- [ ] 2.2 In `src/render/component.ts`, remove `nextAnonymousId`, add a local 32-bit FNV-1a helper, and keep precedence `explicit name -> fn.name -> Component#{hash}`.
- [ ] 2.3 In `src/render/component.ts`, update normalization and overloads so `defineComponent(fn, options?)` works while `defineComponent('Name', fn)` remains unchanged.
- [ ] 2.4 In `src/index.ts`, re-export `ComponentOptions` from the public API surface.

## Phase 3: GREEN / Integration

- [ ] 3.1 GREEN: Make `tests/component.test.ts`, `tests/ssr.test.ts`, and `tests/types/component.test-d.ts` pass without any sequential-number assumptions.
- [ ] 3.2 Update `openspec/changes/eliminate-next-anonymous-id-global/specs/component/spec.md` with the minifier-collision caveat and explicit-name guidance if wording drift remains.

## Phase 4: Verification / Cleanup

- [ ] 4.1 Run `bun test tests/component.test.ts tests/ssr.test.ts`, then `bun test`, to verify unit and integration scenarios.
- [ ] 4.2 Run `bun run typecheck` to validate the new overloads, exported `ComponentOptions`, and type-test compatibility.
- [ ] 4.3 REFACTOR: Remove any obsolete counter-only comments/helpers from `src/render/component.ts` and update this checklist during `sdd-apply`.
