# Axiom — src/ Architecture

## Structure

Axiom uses a hybrid structure that balances architectural clarity with pragmatic flat access for orchestration.

```Text
src/
├── core/           — Pure foundations (types, contracts). Zero internal runtime dependencies.
├── reactivity/     — Reactive runtime (signals). Depends only on core/.
├── render/         — Two-phase rendering pipeline: prepare → reflow → diff → commit.
│   ├── engines/    — Layout engines (flexbox, grid, fast-path).
│   └── strategy/   — Layout strategies (responsive).
├── features/       — Optional features (animation, context, forms, plugin, portal, style).
├── app.ts          — App orchestration (root file).
├── router.ts       — Client-side routing (root file).
├── scheduler.ts    — Async scheduling (root file).
├── ssr.ts          — Server-side rendering (root file).
├── testing.ts      — Testing utilities (public surface: axiom/testing).
└── index.ts        — Public API facade (re-exports only).
```

## Dependency Rules

These rules apply to **runtime imports**. Type-only imports may cross boundaries when needed
to avoid type duplication during the current refactor stage.

| Layer | May import from |
| ------- | ----------------- |
| `core/` | (nothing — pure foundation, runtime) |
| `reactivity/` | `core/` |
| `render/` | `core/`, `reactivity/` |
| `features/` | `core/`, `reactivity/`, `render/` (public contracts only) |
| Root files | anywhere as needed |

### Type-only boundary notes

- `src/core/types.ts` currently references `SafeStyleProps` as a type-only import from `src/features/style.ts`.
- `src/render/{prepare,diff}.ts` also use type-only references to `SafeStyleProps`.
- This does **not** imply runtime coupling. A future cleanup may relocate shared style types into `core/` if we decide to eliminate these type-only bridges.

## Architectural Exception

**`render/commit.ts` → `features/style.ts`**: Allowed for CSS application during the commit phase.  
Decoupling requires functional refactoring (strategy pattern or callback injection) which is out of scope for the structural change.  
Documented in [PLAN-REFACTOR-SRC-HIBRIDO.md](./PLAN-REFACTOR-SRC-HIBRIDO.md) and marked with an inline comment in `src/render/commit.ts`.

## Public API

`src/index.ts` is the **only** surface consumers should import from. Internal modules are implementation details and may change between minor versions without semver guarantees.

Exception: `commitHydrate` is exported as an advanced hydration API.

---

## Interaction Model

> **"The DOM is just the output screen."**  
> UI owned by Axiom must also be _driven_ by Axiom — declaratively, inside the tree.

### Canonical pattern: component-first events

Event handlers live in the component tree via the `on` property:

```typescript
defineComponent(() => ({
  type: 'element',
  tag: 'button',
  on: { click: () => { count.value++ } },   // handler declared in tree
  children: [{ type: 'text', content: 'Increment' }],
}))
```

`on` is defined on `ElementNode` (`src/core/types.ts`), wired by `prepare.ts`, diffed by
`diff.ts`, and applied by `commit.ts`. No post-render DOM query is needed.

### Escape hatch: browser-level integration

`window.addEventListener`, `document.addEventListener`, and `popstate` are legitimate for:

- **Client-side router** — `popstate` / `hashchange` listeners (`src/router.ts`)
- **Third-party widgets** — elements whose lifecycle Axiom does not own
- **Demo control panels** — static HTML controls that drive an Axiom canvas from outside

These cases must be clearly scoped (module-level or component teardown) and are **not** the
default interaction pattern. When the element being interacted with belongs to the Axiom tree,
use `on: {}` instead.

### Rule summary

| Element belongs to Axiom tree? | Pattern |
| ------------------------------ | ------- |
| Yes                            | `on: { click: () => { signal.value++ } }` |
| No (browser / external)        | `addEventListener` as explicit escape hatch |
