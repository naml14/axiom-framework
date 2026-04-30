# Tasks: strict-types-sprint

## Phase 1: Foundation

- [ ] 1.1 Update `package.json` and Bun lockfile to add `expect-type` as a devDependency without changing runtime dependencies.
- [ ] 1.2 Update `tsconfig.json` `include` to cover `tests/types/**/*.test-d.ts` and create `tests/types/` for type-only contracts.

## Phase 2: Type tests first (RED)

- [ ] 2.1 Create `tests/types/reactivity.test-d.ts` with `expect-type` and `@ts-expect-error` for `signal`, `computed`, and `effect` inference/rejection cases.
- [ ] 2.2 Create `tests/types/forms.test-d.ts` covering `validate`, `SyncRule`, `AsyncRule`, and built-in rule factories with positive and negative assertions.
- [ ] 2.3 Create `tests/types/context.test-d.ts` covering `createContext`, `withContext`, `useContext`, literal preservation, and `NoInfer` rejection cases.
- [ ] 2.4 Create `tests/types/plugin.test-d.ts` proving `createPlugin` preserves literals and does not widen config fields.
- [ ] 2.5 Create `tests/types/syntax-h.test-d.ts` and `tests/types/jsx-runtime.test-d.ts` for component prop preservation, unknown prop rejection, and JSX runtime smoke types.
- [ ] 2.6 Create `tests/types/router.test-d.ts` proving ergonomic valid routes compile and invalid `Route.component` values fail without public `any`.
- [ ] 2.7 Ensure the type-test suite contains at least 30 explicit assertions across all public API areas listed in the specs.

## Phase 3: Implementation (GREEN)

- [ ] 3.1 Adjust `src/core/types.ts` so `ComponentDefinition<unknown>` remains assignable at route boundaries under `strictFunctionTypes` via method syntax or equivalent safe alias.
- [ ] 3.2 Update `src/router.ts` to replace public `Route.component: ComponentDefinition<any>` with the safe unknown-bound route component type from 3.1.
- [ ] 3.3 Update `src/syntax/h.ts`, `src/syntax/h.dev.ts`, and `src/jsx-dev-runtime.ts` to use props extraction (`PropsOf<C>` or equivalent) instead of `FunctionalComponent<any>`, keeping runtime unchanged.
- [ ] 3.4 Update `src/features/plugin.ts` to `createPlugin<const T extends AxiomPlugin>(config: T): T` while preserving runtime validation.
- [ ] 3.5 Update `src/features/context.ts` to add `<const T>` to `createContext` and `NoInfer<T>` to `withContext` while keeping `Signal<T> | T` behavior.

## Phase 4: Documentation and verification

- [ ] 4.1 Update `CHANGELOG.md` under `[Unreleased]` with type-only API tightening notes and migration guidance for route/components and stricter props.
- [ ] 4.2 Verify with `bun run typecheck` and `bun test`; fix any type-contract regressions without running a build.
