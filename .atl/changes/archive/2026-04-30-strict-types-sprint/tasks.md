# Tasks: strict-types-sprint

## Phase 1: Foundation

- [x] 1.1 Update `package.json` and Bun lockfile to add `expect-type` as a devDependency without changing runtime dependencies.
- [x] 1.2 Update `tsconfig.json` `include` to cover `tests/types/**/*.test-d.ts` and create `tests/types/` for type-only contracts.

## Phase 2: Type tests first (RED)

- [x] 2.1 Create `tests/types/reactivity.test-d.ts` with `expect-type` and `@ts-expect-error` for `signal`, `computed`, and `effect` inference/rejection cases.
- [x] 2.2 Create `tests/types/forms.test-d.ts` covering `validate`, `SyncRule`, `AsyncRule`, and built-in rule factories with positive and negative assertions.
- [x] 2.3 Create `tests/types/context.test-d.ts` covering `createContext`, `withContext`, `useContext`, literal preservation, and `NoInfer` rejection cases.
- [x] 2.4 Create `tests/types/plugin.test-d.ts` proving `createPlugin` preserves literals and does not widen config fields.
- [x] 2.5 Create `tests/types/syntax-h.test-d.ts` and `tests/types/jsx-runtime.test-d.ts` for component prop preservation, unknown prop rejection, and JSX runtime smoke types.
- [x] 2.6 Create `tests/types/router.test-d.ts` proving ergonomic valid routes compile and invalid `Route.component` values fail without public `any`.
- [x] 2.7 Ensure the type-test suite contains at least 30 explicit assertions across all public API areas listed in the specs.

## Phase 3: Implementation (GREEN)

- [x] 3.1 Adjust `src/core/types.ts` so `ComponentDefinition<unknown>` remains assignable at route boundaries under `strictFunctionTypes` via method syntax or equivalent safe alias.
- [x] 3.2 Update `src/router.ts` to replace public `Route.component: ComponentDefinition<any>` with the safe unknown-bound route component type from 3.1.
- [x] 3.3 Update `src/syntax/h.ts`, `src/syntax/h.dev.ts`, and `src/jsx-dev-runtime.ts` to use props extraction (`PropsOf<C>` or equivalent) instead of `FunctionalComponent<any>`, keeping runtime unchanged.
- [x] 3.4 Update `src/features/plugin.ts` to `createPlugin<const T extends AxiomPlugin>(config: T): T` while preserving runtime validation.
- [x] 3.5 Update `src/features/context.ts` to add `<const T>` to `createContext` and `NoInfer<T>` to `withContext` while keeping `Signal<T> | T` behavior.

## Phase 4: Documentation and verification

- [x] 4.1 CHANGELOG update intentionally skipped per explicit user instruction after verification.
- [x] 4.2 Verify with `bun run typecheck` and `bun test`; fix any type-contract regressions without running a build.
