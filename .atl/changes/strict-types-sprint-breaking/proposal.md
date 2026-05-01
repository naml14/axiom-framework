# Proposal: strict-types-sprint-breaking

## Intent

Address the breaking changes from the TypeScript advanced types audit (Criteria 7 and 14) toward v1.0.0. We will enforce stricter structural typing by adding variance annotations to reactive primitives and enabling `exactOptionalPropertyTypes`. This builds confidence for consumers adopting the framework while minimizing the breaking-change window.

## Scope

### In Scope
- Add variance modifiers (`in out`, `out`) to `Signal`, `ComputedSignal`, and `Context` types.
- Enable `exactOptionalPropertyTypes: true` in `tsconfig.json` and `tsconfig.build.json`.
- Document breaking changes and migration paths in `CHANGELOG.md`.

### Out of Scope
- Fixing non-breaking type issues (handled by `strict-types-sprint`).
- Extensive refactoring of consumer-facing APIs beyond structural type strictness.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `reactivity`: add variance to `Signal`, `ComputedSignal`, `Context`.
- `tsconfig-strictness`: enable `exactOptionalPropertyTypes`.

## Approach

1. Update `src/core/types.ts` to add `in out` for `Signal` and `out` for `ComputedSignal` and `Context`.
2. Enable `exactOptionalPropertyTypes` in the tsconfig files.
3. Fix the resulting TS errors across `src/**/*.ts` by replacing `{ prop: undefined }` with omitted keys or conditional spread `{ ...(condition && { prop }) }`.
4. Add variance assertions in `tests/types/`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/types.ts:13-21` | Modified | Add `in out`/`out` modifiers |
| `tsconfig.json` | Modified | Enable `exactOptionalPropertyTypes` |
| `tsconfig.build.json` | Modified | Inherits flag |
| `src/**/*.ts` | Modified | Fix optional property writes (cascade < 10 sites) |
| `tests/types/` | Modified | Add variance assertions and exactOptional assertions |
| `CHANGELOG.md` | Modified | Document breaking type changes with migration notes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Variance breaks consumer subtyping | Low | Add CHANGELOG migration notes with examples. |
| Cascade larger than estimated | Medium | Time-box to 1 day; if massive, split PR per module. |
| Passing `undefined` to optional props breaks | Medium | Document migration pattern in CHANGELOG. |

## Rollback Plan

Revert the PR. Since this is a type-only change with no runtime impact, reverting is safe. Type-level tests from `strict-types-sprint` will catch any regressions if reverted.

## Dependencies

- **strict-types-sprint**: MUST be merged first, as it establishes the type-level test infrastructure required to catch regressions.

## Success Criteria

- [ ] `Signal<in out T>`, `ComputedSignal<out T>`, `Context<out T>` declared in `src/core/types.ts`.
- [ ] `tsconfig.json` has `"exactOptionalPropertyTypes": true`.
- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes (532+ tests still green).
- [ ] Type-level tests in `tests/types/` assert variance behavior.
- [ ] CHANGELOG migration notes added under `[Unreleased]` → "Breaking (types only)".
- [ ] PR is merged ONLY AFTER `strict-types-sprint` is merged.
