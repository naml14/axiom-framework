# Design: strict-types-sprint

## Technical Approach

Implement the safe v1.0 type-safety sprint as **type-only public API tightening plus type-contract tests**. Runtime behavior stays unchanged: `bun test` remains for behavior, while `bun run typecheck` becomes the gate for type regressions via `tests/types/**/*.test-d.ts` and `expect-type`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Type assertions | `expect-type` | `tsd`, raw `@ts-expect-error` only | Works with plain `tsc --noEmit`, no separate runner, supports positive assertions; `@ts-expect-error` remains for negative cases. |
| Type-test execution | Include `tests/types/**/*.test-d.ts` in `tsconfig.json` | Add a separate `typecheck:types` command | CI already runs `bun run typecheck`; one compiler pass keeps the contract impossible to skip. |
| Route boundary | `ComponentDefinition<unknown>` using method-style `_fn` | Keep `any`; use `ComponentDefinition<never>` | `unknown` removes public `any`. Because `_fn` is currently a function property, implementation should either convert `_fn(props: Props)` to method syntax or introduce a route-safe alias; otherwise existing `ComponentDefinition<void>` routes become non-assignable under `strictFunctionTypes`. |
| `h()` props | Extract props from the component function | Simple `h<P>(tag: FunctionalComponent<P>, props?: P)` | Simple `P` inference may widen from the props object and allow extras. Use `PropsOf<C>` so the component owns the contract. |
| TS 5+ features | Use `const` type params + `NoInfer<T>` | Manual helper types | Project already uses TypeScript `^6.0.3`; these are additive DX improvements. |

## Type Flow

```text
Public API call ──→ Type signature ──→ tests/types/*.test-d.ts ──→ tsc --noEmit ──→ CI gate
      │                    │                         │
      └─ runtime unchanged └─ stricter inference     └─ expect-type + @ts-expect-error
```

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json` | Modify | Add `expect-type` devDependency. |
| `tsconfig.json` | Modify | Include `tests/types/**/*.test-d.ts`. |
| `tests/types/*.test-d.ts` | Create | Add ≥30 assertions for signals, computed, effect, forms, context, plugin, `h()`, JSX/runtime, routing. |
| `src/core/types.ts` | Modify | If needed, change `ComponentDefinition._fn` to method syntax to preserve route assignability with `unknown`. |
| `src/router.ts` | Modify | Replace `Route.component: ComponentDefinition<any>` with safe unknown-bound route component type. |
| `src/syntax/h.ts` | Modify | Replace `FunctionalComponent<any>` overload with props-extracting overload. |
| `src/syntax/h.dev.ts` | Modify | Mirror `h.ts` overloads for dev runtime. |
| `src/jsx-dev-runtime.ts` | Modify | If needed, align local functional component typing with `hDev`. |
| `src/features/plugin.ts` | Modify | `createPlugin<const T extends AxiomPlugin>(config: T): T`. |
| `src/features/context.ts` | Modify | `createContext<const T>(...)`; `withContext<T, R>(ctx, value: Signal<NoInfer<T>> | NoInfer<T>, ...)`. |
| `CHANGELOG.md` | Modify | Document type-only API tightening under `[Unreleased]`. |

## Interfaces / Contracts

```ts
type PropsOf<C> = C extends (props: infer P) => ComponentNode ? P : never

export function h<C extends (props: never) => ComponentNode>(
  tag: C,
  props?: PropsOf<C> | null,
  ...children: HChild[]
): ComponentNode

export interface Route {
  path: string
  component: ComponentDefinition<unknown> // or equivalent route-safe alias
  name?: string
}

export function createPlugin<const T extends AxiomPlugin>(config: T): T
export function createContext<const T>(defaultValue: T): Context<T>
export function withContext<T, R>(ctx: Context<T>, value: Signal<NoInfer<T>> | NoInfer<T>, children: () => R): R
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type | Inference and rejection contracts | `tests/types/*.test-d.ts` with `expectTypeOf` and `@ts-expect-error`. |
| Runtime | Existing behavior unchanged | Existing `bun test`; no new runtime test requirement unless signatures force fixture changes. |
| CI | Type tests cannot be skipped | Existing GitHub Action already runs `bun run typecheck`. |

## Migration / Rollout

No runtime migration required. This is a type-only tightening for v1.0 preparation. Consumers with loose route/component typing may need explicit component definitions or narrower props; document this in `CHANGELOG.md`.

## Open Questions

- None.
