# Axiom — src/ Architecture

## Structure

Axiom uses a hybrid structure that balances architectural clarity with pragmatic flat access for orchestration.

```Text
src/
├── core/           — Pure foundations (types, contracts). Zero internal dependencies.
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

| Layer | May import from |
| ------- | ----------------- |
| `core/` | (nothing — pure foundation) |
| `reactivity/` | `core/` |
| `render/` | `core/`, `reactivity/` |
| `features/` | `core/`, `reactivity/`, `render/` (public contracts only) |
| Root files | anywhere as needed |

## Architectural Exception

**`render/commit.ts` → `features/style.ts`**: Allowed for CSS application during the commit phase.  
Decoupling requires functional refactoring (strategy pattern or callback injection) which is out of scope for the structural change.  
Documented in [PLAN-REFACTOR-SRC-HIBRIDO.md](./PLAN-REFACTOR-SRC-HIBRIDO.md) and marked with an inline comment in `src/render/commit.ts`.

## Public API

`src/index.ts` is the **only** surface consumers should import from. Internal modules are implementation details and may change between minor versions without semver guarantees.

Exception: `commitHydrate` is exported as an advanced hydration API.
