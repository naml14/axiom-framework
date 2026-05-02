# Proposal: strict-types-sprint

## Intent

Ship a v1.0 that is easy to adopt quickly and at scale by maximizing type-safety. Eliminate unjustified `any` casts from the public surface, preserve type literals, and establish a pure type-level testing infrastructure using `expect-type`.

## Scope

### In Scope
- Remove `ComponentDefinition<any>` from `Route`.
- Add generic overload for `h()` to preserve prop types.
- Add `const` type params to `createPlugin` and `createContext`.
- Add `NoInfer<T>` to `withContext`.
- Introduce `expect-type` tests in CI.

### Out of Scope
- Enabling `exactOptionalPropertyTypes` (deferred to a breaking-changes proposal).
- Adding variance annotations to core types (deferred).
- `.d.ts` rollup using API extractor.
- Rewriting mock fixtures.

## Capabilities

### New Capabilities
- `type-level-tests`: Type-only test suite verifying public API contracts, gated in CI.

### Modified Capabilities
- `routing`: Tighten `Route.component` type from `any` to `unknown`.
- `syntax-h`: Add generic functional-component overload preserving `P`.
- `plugin-system`: Const-preserve literal config in `createPlugin`.
- `context-api`: Const-preserve in `createContext`, `NoInfer` on `withContext`.

## Approach

- Install `expect-type` as a devDependency.
- Create `tests/types/` mirroring the `src/` directory.
- Add `tests/types/**/*.test-d.ts` to `tsconfig.json`'s `include`.
- Apply targeted type tightening in `src/router.ts`, `src/syntax/h.ts`, `src/features/plugin.ts`, and `src/features/context.ts`.
- Ensure `bun run typecheck` runs type-level assertions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/router.ts:10` | Modified | `Route.component` type tighten to `unknown` |
| `src/syntax/h.ts`, `h.dev.ts` | Modified | Generic `h<P>` overload added |
| `src/features/plugin.ts:73` | Modified | `<const T>` in `createPlugin` |
| `src/features/context.ts:44, 64` | Modified | `<const T>` in `createContext`, `NoInfer<T>` on `withContext` |
| `tests/types/` | New | Type-level test suite with `expect-type` |
| `tsconfig.json` | Modified | Include `tests/types/**` |
| `package.json` | Modified | Add `expect-type` devDependency |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `any` prop breakages in consumers | Low | Project is pre-1.0 with limited adoption. CHANGELOG entry + type narrowing examples cover migration. |
| Added devDependency | Low | `expect-type` is tiny, has no transitive deps, and is dev-only |
| TypeScript Version | Low | `NoInfer<T>` (TS 5.4+) and `const` (TS 5.0+) already guaranteed by package.json |

## Rollback Plan

Revert PR. No runtime code changes — only type signatures and new test files. No data migration needed.

## Success Criteria

- [ ] No `any` in `src/router.ts` public exports
- [ ] `h(MyComponent, { unknownProp: 1 })` produces type error
- [ ] `createPlugin({ name: 'x' })` infers `name: 'x'` (literal)
- [ ] `withContext(ctx, value, ...)` rejects values that widen the context type
- [ ] `tests/types/` exists with ≥ 30 type assertions across all major public APIs
- [ ] `bun run typecheck` includes type-tests and is enforced in CI
- [ ] CHANGELOG entry under `[Unreleased]` documents the API tightening
