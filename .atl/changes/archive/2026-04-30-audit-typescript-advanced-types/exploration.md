# Exploration: TypeScript Advanced Types Audit

> Change: `audit-typescript-advanced-types` | Project: `axiom-framework`  
> Phase: explore | Date: 2026-04-30

---

## Exploration: TypeScript Advanced Types Audit

### Executive Summary

Axiom Framework has a **strong TypeScript foundation**: strict mode is on, `noUncheckedIndexedAccess` is enabled, discriminated unions are used for the core node tree, template literal types appear in layout DSLs, and the public API surface is explicitly gated via `export type`. The biggest gaps are: (1) **zero type-level tests** — no `expectTypeOf`, `tsd`, or `@ts-expect-error` coverage; (2) **`exactOptionalPropertyTypes` is absent** from both tsconfigs; (3) **~3 unjustified `any` casts** in public overloads (`h()`, `Route.component`) that propagate into the d.ts; (4) **no `NoInfer<T>` usage** despite several inference-guiding opportunities; and (5) **demo files import `../src/index.ts` directly** instead of `axiom-framework`, so dogfooding doesn't actually exercise the package exports map. Recommend a focused change that adds type-level tests, enables `exactOptionalPropertyTypes`, and removes the three remaining surface-level `any` casts.

---

### tsconfig Posture

| Flag | tsconfig.json | tsconfig.build.json | Recommendation |
|------|:---:|:---:|----------------|
| `strict` | ✅ | ✅ (inherited) | — |
| `noUncheckedIndexedAccess` | ✅ | ✅ (inherited) | — |
| `noImplicitOverride` | ✅ | ✅ (inherited) | — |
| `exactOptionalPropertyTypes` | ❌ | ❌ | **Add** — many optional bag interfaces will silently accept `undefined` writes today |
| `noUnusedLocals` | ❌ (disabled) | ❌ | Enable gradually or in CI |
| `noUnusedParameters` | ❌ (disabled) | ❌ | Enable gradually |
| `noPropertyAccessFromIndexSignature` | ❌ (disabled) | ❌ | Nice-to-have |
| `verbatimModuleSyntax` | ✅ | ❌ (implicit) | Already set in base |
| `declaration` + `declarationMap` | ✅ | ✅ | — |

**Missing critical**: `exactOptionalPropertyTypes`

---

### Public API Surface

`dist/index.d.ts` re-exports from individual module `.js` files — consumers must resolve through the package `exports` map. Structural analysis:

- **✅ No `any` in emitted types** for most exports. `dist/index.d.ts` itself is clean.
- **⚠️ `Route.component: ComponentDefinition<any>`** — leaks `any` into `Route` which is a public type. Consumers lose type-safety on component props when registering routes.
- **⚠️ `h(tag: FunctionalComponent<any>, ...)`** — overload 2 accepts `FunctionalComponent<any>`, so JSX usage of components loses prop-type checking at the call site.
- **⚠️ No `.d.ts` rollup** — consumers see implementation-internal paths (`./render/component.js`, `./core/types.js`, etc.) in re-export chains. Leaks internal structure; a `dts-bundle-generator` or `@microsoft/api-extractor` would produce a clean single-file declaration.
- **⚠️ `testing.ts` and `scheduler.ts` emit `.d.ts`** (present in `dist/`) but are NOT in `src/index.ts`. They are accessible via direct path import, bypassing the exports map — intentional or leak?
- **✅ `export type` used correctly** — all type-only exports use `export type`.

---

### Criteria Scorecard (23)

| # | Criterion | Status | Severity | Evidence |
|---|-----------|--------|----------|----------|
| 1 | API public type-safety | ⚠️ | importante | `src/router.ts:10` — `ComponentDefinition<any>`; `src/syntax/h.ts:47` — `FunctionalComponent<any>` in public overload |
| 2 | Inference-first | ✅ | — | `signal<T>`, `computed<T>`, `validate<T>` all infer from value; consumer writes 0 annotations for happy path |
| 3 | Discriminated unions | ✅ | — | `ComponentNode = ElementNode \| TextNode \| FragmentNode \| PortalNode` (type literal on each); `ValidationRule<T> = SyncRule<T> \| AsyncRule<T>` |
| 4 | Branded types | ⚠️ | nice-to-have | `PreparedComponent` uses `unique symbol` brand (`src/core/types.ts:74`). No branded types for signal IDs, component IDs, or route paths |
| 5 | Template literal types | ✅ | — | `LayoutUnitValue = \`${number}px\` \| \`${number}%\` \| \`${number}vw\` \| \`${number}vh\`` (`src/core/types.ts:102`); `GridTemplateColumns = number \| \`repeat(${number}, 1fr)\`` |
| 6 | Conditional + mapped types | ✅ | — | `AxiomEventHandlers` uses `[K in keyof DOMEventMap as \`on${Capitalize<K>}\`]`; `HtmlAttrValueMap` uses intersected `Record<K,V>` mapped types |
| 7 | Variance correctness | ❌ | importante | No `in`/`out` variance annotations on `Signal<T>`, `ComputedSignal<T>`, `Context<T>`. These are structurally covariant/contravariant but the compiler must infer it each time |
| 8 | `satisfies` vs explicit annotation | ⚠️ | nice-to-have | Used in 3 places (`src/testing.ts:155`, `src/app.ts:98`, `src/render/component.ts:30`). Many object literals that could benefit from `satisfies` still use explicit type annotations or unchecked casts |
| 9 | No unjustified `any`/`unknown`/`as` | ⚠️ | importante | 3 `any` instances in `src/`: `commit.ts:252` (`globalThis as any`), `syntax/h.ts:47` + `router.ts:10` in public overloads. ~95 `as` casts in `src/`, mostly justified DOM-augmentation casts but several are avoidable |
| 10 | `const` type parameters (TS 5.0+) | ❌ | importante | Not used. `createPlugin`, `createContext`, `h()` tag-string overload could all preserve literal types with `<const T>` |
| 11 | `NoInfer<T>` (TS 5.4+) | ❌ | importante | Not used. Prime candidate: `withContext<T,R>(ctx, value, children)` — `value` should be `NoInfer<T>` to prevent the value from widening `T` |
| 12 | HKT emulation | ❌ | nice-to-have | No HKT pattern. `Signal<T>` and `ComputedSignal<T>` are separate interfaces, not a generic container `Kind<T>`. Low priority for this size of framework |
| 13 | Type-level tests | ❌ | **bloqueante 1.0** | Zero `expectTypeOf`, `tsd`, or `@ts-expect-error` in tests/. No CI type regression gate beyond `tsc --noEmit` |
| 14 | `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` | ⚠️ | importante | `noUncheckedIndexedAccess` ✅. `exactOptionalPropertyTypes` ❌ — absent from both tsconfigs |
| 15 | Public API surface controlled | ⚠️ | importante | `export type` used ✅. No `.d.ts` rollup — internal paths visible in re-export chain. `testing.ts`/`scheduler.ts` emit declarations but aren't in public `index.ts` |
| 16 | `@internal`/`@public` JSDoc tags | ⚠️ | nice-to-have | `@internal` used only in `src/testing.ts` (4 occurrences). No `@public` tags. No `@alpha`/`@beta`. `validate-api-stability.ts` script exists but doesn't use api-extractor |
| 17 | Recursive types with depth bounds | ✅ | — | `HChild` is recursive (`HChild[]`) but shallow in practice; no "excessively deep" errors observed. `tsc --noEmit` passes cleanly |
| 18 | Distributive vs non-distributive conditionals | N/A | — | No conditional types in the codebase that require `[T] extends [U]` guards |
| 19 | Builder pattern with phantom states | N/A | — | No builder pattern in this codebase |
| 20 | Module augmentation | ❌ | importante | No `declare module 'axiom-framework'` augmentation point exposed. Plugin system is runtime-only (`AxiomPlugin` interface). No way for plugins to extend `PluginContext` or `HProps` types at compile time |
| 21 | Tests with strict types | ⚠️ | importante | ~250 `any` matches in tests/. `reflow.test.ts` alone has ~80 `as any` casts on layout objects; `flow.test.ts` casts internal node shapes with `(node as any)`. Mocks lack typed fixtures |
| 22 | Demo + benchmarks dogfood public API | ❌ | importante | Demo imports from `../src/index.ts` (10 matches), not `axiom-framework`. Doesn't exercise exports map or bundled types. `benchmarks/` not found in include |
| 23 | Scripts typed | ✅ | — | `scripts/validate-api-stability.ts` and `scripts/validate-coverage.ts` are full TypeScript, no plain JS |

---

### Detailed Findings

#### Criterion 1: API public type-safety

- **Status**: ⚠️ Partial
- **Where**: `src/router.ts:10`, `src/syntax/h.ts:47`, `src/syntax/h.dev.ts:25`
- **Problem**: `Route.component` is typed `ComponentDefinition<any>` — any component with any props can be registered without type checking. `h()` functional overload accepts `FunctionalComponent<any>` — loses prop-checking when calling `h(MyComp, { wrong: true })`.
- **Recommendation**:
  ```ts
  // router.ts
  export interface Route<Props = unknown> {
    path: string
    component: ComponentDefinition<Props>
    name?: string
  }
  // Or use unknown instead of any to force narrowing at call site
  component: ComponentDefinition<unknown>
  ```
  For `h()`, use a generic overload:
  ```ts
  export function h<P>(tag: FunctionalComponent<P>, props: P, ...children: HChild[]): ComponentNode
  ```
- **Effort**: Medium

#### Criterion 7: Variance correctness

- **Status**: ❌ Fail
- **Where**: `src/core/types.ts:13-16`, `src/core/types.ts:18-21`
- **Problem**: `Signal<T>` has both getter and setter — it's invariant. `ComputedSignal<T>` is read-only but no `out` annotation. Without explicit variance, TypeScript performs expensive structural subtype checks.
- **Recommendation**:
  ```ts
  export interface Signal<in out T> {
    get value(): T
    set value(v: T)
  }
  export interface ComputedSignal<out T> extends Signal<T> {}
  ```
- **Effort**: Low

#### Criterion 10: `const` type parameters

- **Status**: ❌ Fail
- **Where**: `src/features/plugin.ts:73`, `src/features/context.ts:44`, `src/syntax/h.ts:45`
- **Problem**: `createPlugin({ name: 'my-plugin', ... })` — `name` widens to `string` instead of preserving `'my-plugin'` literal. Same for context default values.
- **Recommendation**:
  ```ts
  export function createPlugin<const T extends AxiomPlugin>(config: T): T
  // Now: createPlugin({ name: 'devtools' }) → type is { name: 'devtools', ... }
  ```
- **Effort**: Low

#### Criterion 11: `NoInfer<T>`

- **Status**: ❌ Fail
- **Where**: `src/features/context.ts:64-80`
- **Problem**: `withContext<T,R>(ctx: Context<T>, value: Signal<T> | T, children: () => R)` — TypeScript may infer `T` from `value` and widen the context type unexpectedly.
- **Recommendation**:
  ```ts
  export function withContext<T, R>(
    ctx: Context<T>,
    value: NoInfer<Signal<T> | T>,
    children: () => R
  ): R
  ```
- **Effort**: Low

#### Criterion 13: Type-level tests

- **Status**: ❌ Fail (bloqueante 1.0)
- **Where**: `tests/` — no type tests found
- **Problem**: No regression gate for type contracts. A refactor can silently break inference without any test failing.
- **Recommendation**: Add `tests/types/` folder with `vitest` `expectTypeOf` assertions or standalone `tsd` `.test-d.ts` files:
  ```ts
  // tests/types/signals.test-d.ts
  import { expectTypeOf } from 'vitest'
  import { signal, computed } from 'axiom-framework'
  
  const s = signal(42)
  expectTypeOf(s.value).toBeNumber()
  
  const c = computed(() => s.value * 2)
  expectTypeOf(c.value).toBeNumber()
  // @ts-expect-error — computed is read-only
  c.value = 0
  ```
  Add `bun run typecheck` step to CI.
- **Effort**: Medium

#### Criterion 14: `exactOptionalPropertyTypes`

- **Status**: ⚠️ Partial
- **Where**: `tsconfig.json`, `tsconfig.build.json`
- **Problem**: `exactOptionalPropertyTypes` is not enabled. Interfaces like `LayoutProps`, `HProps`, `HydrationOptions` all have optional properties — without this flag, `{ strictMismatch: undefined }` is silently valid where `{ strictMismatch?: boolean }` is declared.
- **Recommendation**: Add `"exactOptionalPropertyTypes": true` to `tsconfig.json`. Expect a small number of compile errors to fix (particularly places that explicitly assign `undefined` to optional props).
- **Effort**: Low (flag) + Medium (fixing cascading errors)

#### Criterion 15: Public API surface controlled

- **Status**: ⚠️ Partial
- **Where**: `dist/` declaration files
- **Problem**: No `.d.ts` rollup. Consumers importing `axiom-framework` get re-exports pointing to `./render/component.js`, `./core/types.js` etc., revealing internal structure. `dist/scheduler.d.ts` and `dist/testing.d.ts` are emitted but not part of public surface — discoverable via direct path.
- **Recommendation**: Add `@microsoft/api-extractor` or `dts-bundle-generator` to produce `dist/index.d.ts` as a single rolled-up file. Mark internal-only declarations with `@internal`.
- **Effort**: Medium

#### Criterion 20: Module augmentation

- **Status**: ❌ Fail
- **Where**: `src/features/plugin.ts`
- **Problem**: No way for third-party plugins to extend `PluginContext` or add typed hooks. Plugin system is purely runtime.
- **Recommendation**:
  ```ts
  // In plugin.ts
  declare module 'axiom-framework' {
    interface PluginContext {
      // augmentable by plugins
    }
  }
  ```
  Expose the augmentation point in docs and the exports map.
- **Effort**: Low

#### Criterion 21: Tests with strict types

- **Status**: ⚠️ Partial
- **Where**: `tests/reflow.test.ts` (~80 `as any`), `tests/syntax/flow.test.ts` (~15 `as any`), `tests/syntax/integration.test.ts` (~8 `as any`)
- **Problem**: Most `as any` casts in tests exist because `PreparedComponent` is an opaque branded type — internal getters (`getPreparedChildren`, `getTag`, etc.) are not exported, so tests pierce the abstraction with casts. This is partially a design issue: the test utilities in `testing.ts` don't expose enough introspection for tests to avoid `as any`.
- **Recommendation**: Export `getNodeIndex`, `getNodeType`, `getPreparedChildren` from `testing.ts` (or a dedicated `testing-internal.ts`), document as `@internal`, and update tests to use them.
- **Effort**: Medium

#### Criterion 22: Demo dogfoods public API

- **Status**: ❌ Fail
- **Where**: `demo/app.ts:1`, `demo/syntax-showcase.ts:15`, `demo/ruta-b-showcase.ts:19` (10 files)
- **Problem**: All demo files import from `'../src/index.ts'` directly — they skip the `exports` map, the bundled types, and the `axiom-framework` package alias. Bugs in the exports map or d.ts rollup would be invisible.
- **Recommendation**: Configure `tsconfig.json` `paths` to resolve `axiom-framework` → `./src/index.ts` (already done!) but update demo imports to use `import { ... } from 'axiom-framework'` instead of the relative path. The path alias is there — demo files just don't use it.
- **Effort**: Low

---

### Hot-Spot Files (Top 10)

1. **`src/syntax/h.ts`** — Core JSX factory; `FunctionalComponent<any>` overload, ~20 `as` casts. Highest consumer touch-point.
2. **`src/render/commit.ts`** — ~30 `as` casts (DOM augmentation pattern). One `as any`. Most complex file.
3. **`src/router.ts`** — `ComponentDefinition<any>` in `Route`. Public type that propagates `any`.
4. **`src/core/types.ts`** — Foundation types; missing variance annotations. Fixes here have framework-wide impact.
5. **`src/features/context.ts`** — `NoInfer<T>` opportunity, `Signal<unknown>` widening via cast.
6. **`tests/reflow.test.ts`** — ~80 `as any` casts. Largest single source of test type noise.
7. **`tests/syntax/flow.test.ts`** — ~15 `as any` casts piercing `PreparedComponent` opacity.
8. **`src/features/plugin.ts`** — `const T` opportunity; no module augmentation surface.
9. **`demo/*.ts`** (all 10 files) — Import wrong path, dogfooding gap.
10. **`tsconfig.json`** — Missing `exactOptionalPropertyTypes`; all optional props affected.

---

### Quick Wins (< 1 day each)

- **Enable `exactOptionalPropertyTypes`** in `tsconfig.json` and fix cascading errors (likely < 10).
- **Add `in out` variance to `Signal<T>`** and `out` to `ComputedSignal<T>` (`src/core/types.ts`).
- **Replace `Route.component: ComponentDefinition<any>`** with `ComponentDefinition<unknown>` in `src/router.ts`.
- **Add `<const T>` to `createPlugin`** in `src/features/plugin.ts`.
- **Fix demo imports** to use `axiom-framework` alias instead of `../src/index.ts`.
- **Add `NoInfer<T>` to `withContext` value param** in `src/features/context.ts`.

---

### Deep Refactors (multi-day)

- **Type-level test suite** — Create `tests/types/` with `expectTypeOf` coverage for all public API contracts; integrate into CI. Requires deciding on `vitest`/`tsd`/`@ts-expect-error` strategy.
- **`.d.ts` rollup with api-extractor** — Eliminate internal path leaks in emitted declarations; enforce `@internal`/`@public` tagging systematically.
- **Export typed introspection from `testing.ts`** — Reduce ~100 `as any` casts in tests by exposing branded-type accessors.
- **Typed plugin module augmentation** — Design and expose `declare module 'axiom-framework' { interface PluginContext {} }` pattern with documentation.
- **`h()` generic prop-typed overload** — `h<P>(tag: FunctionalComponent<P>, props: P, ...)` for type-safe JSX-alternative usage.

---

### Recommended Next Change

Create a `sdd-propose` change titled **"type-safety: add type-level tests, enable exactOptionalPropertyTypes, remove surface any casts"** that addresses criteria 1, 7, 10, 11, 13, and 14 as a single focused sprint — these are all related to the type contract and can be verified together.

---

## Current State

The framework has a solid TypeScript base: strict mode, `noUncheckedIndexedAccess`, discriminated unions in the node tree, template literal DSL types, and explicit `export type` discipline. The public d.ts emits cleanly with no `any` in the index declaration. One existing type error exists in `tests/portal.test.ts:762`.

## Affected Areas

- `src/core/types.ts` — variance annotations (Signal, ComputedSignal)
- `src/router.ts` — `ComponentDefinition<any>` → `unknown`
- `src/syntax/h.ts` + `h.dev.ts` — `FunctionalComponent<any>` overload
- `src/features/context.ts` — `NoInfer<T>` in `withContext`
- `src/features/plugin.ts` — `const T` parameter, module augmentation
- `tsconfig.json` — `exactOptionalPropertyTypes`
- `tests/` — type-level tests (new files)
- `demo/*.ts` — import path fix
- `tests/reflow.test.ts`, `tests/syntax/flow.test.ts` — reduce `as any`

## Approaches

1. **Big-bang audit PR** — Fix all 23 criteria in one PR
   - Pros: comprehensive
   - Cons: huge diff, risky, hard to review
   - Effort: High

2. **Phased sprints** — Quick wins first, then deep refactors
   - Pros: reviewable, shippable incrementally, less risk
   - Cons: type-level tests and quick wins split across 2 PRs
   - Effort: Low + Medium

3. **Type-safety sprint only** — Focus on criteria 1, 7, 10, 11, 13, 14 (breaking surface)
   - Pros: highest ROI, directly affects consumers
   - Cons: defers dogfooding and `.d.ts` rollup
   - Effort: Medium

## Recommendation

**Approach 3 first**, then Approach 2 for the remainder. The type-safety sprint (criteria 1, 7, 10, 11, 13, 14) has the highest consumer impact, is self-contained, and can be done in < 3 days. The `.d.ts` rollup and demo dogfooding can follow.

## Risks

- Enabling `exactOptionalPropertyTypes` may cause cascading type errors in consumer code (documented breaking change).
- Adding variance annotations to `Signal<T>` is technically a breaking change if someone has assigned `Signal<Derived>` to `Signal<Base>` (unlikely but possible).
- Type-level tests require choosing a testing strategy (`vitest expectTypeOf` vs `tsd`) — must align with existing `bun:test` toolchain.

## Ready for Proposal

Yes — the exploration is complete. The orchestrator should propose a focused change: **"type-safety: add type-level tests, enable exactOptionalPropertyTypes, remove surface any casts"** covering criteria 1, 7, 10, 11, 13, 14 of this audit.
