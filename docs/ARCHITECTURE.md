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

### Memory Pooling (Zero-Allocation Hot Path)

To guarantee consistent 60fps rendering during continuous updates, Axiom enforces a **zero-allocation policy** during the `reflow -> commit` hot path.

- `LayoutResult` arrays (`x, y, width, height` backed by `Float32Array`) are recycled via `src/render/pool.ts`.
- `LayoutResult` buffers may be larger than the active tree size when reused; `nodeCount` is the authoritative valid range.
- The `reflow` function requests buffers using `acquireLayoutResult(count)`.
- The `app.ts` scheduler releases previous/current buffers via `releaseLayoutResult(result)` across success and error paths.
- The pool is bounded (entry count and max retained capacity) to avoid unbounded steady-state memory growth in long-lived server processes.
- **Engine scratch buffers** (`rowHeights`, `placements`, `deferredQueue`, occupied-cells Set, percent Maps, and flex lines) are recycled via `src/render/engines/scratch.ts`. Each engine acquires scratch at the start of its call and releases it in a `finally` block — so the hot path stays allocation-free across recursive calls (e.g. grid-in-grid, flex-in-grid) and across renders.
- **Diff scratch Maps/Sets** (prev/new index maps, prev/new key maps, portal map, prev/new index sets, layout-changed and all-changed sets) are recycled via `src/render/diff-scratch.ts`. `fullDiff()` calls `resetDiffScratch()` at the start of each pass and then works on the module-scoped containers with `.clear()` instead of re-allocating them. The module exposes one `acquire*` accessor per container plus `__clearDiffScratchForTests()` for teardown between tests.
- **Grid cell keys are packed integers**, not strings: `occupiedCells` is keyed by a numeric encoding of `(row, col)` instead of a `` `${row}:${col}` `` template, so a grid layout no longer allocates one string per occupied cell.
- **Signal notification always iterates a snapshot.** `notifySubscribers()` in `src/reactivity/signals.ts` does `const subs = [...node._subs]` and iterates the copy. This copy is a correctness requirement, not a missed optimisation: a `Set` iterator also visits elements **added** during iteration, so an effect that subscribes to the same node while it is being notified makes the loop unbounded and blocks the renderer forever. See `odd/tasks/axiom-hardening-plan.md` (F2-T7) before touching this loop.

### Type-only boundary notes

- `src/core/types.ts` currently references `SafeStyleProps` as a type-only import from `src/features/style.ts`.
- `src/render/{prepare,diff}.ts` also use type-only references to `SafeStyleProps`.
- This does **not** imply runtime coupling. A future cleanup may relocate shared style types into `core/` if we decide to eliminate these type-only bridges.

## Architectural Exception

**`render/commit.ts` → `features/style.ts`**: Allowed for CSS application during the commit phase.  
Decoupling requires functional refactoring (strategy pattern or callback injection) which is out of scope for the structural change.  
Documented in [PLAN-REFACTOR-SRC-HIBRIDO.md](./PLAN-REFACTOR-SRC-HIBRIDO.md) and marked with an inline comment in `src/render/commit.ts`.

## Enforcement

The premises above are enforced by failing-in tests under `tests/architecture/`:

- `hot-path-dom-reads.test.ts` — scans `src/render/{reflow,commit,diff,prepare,pool}.ts` and `src/render/engines/*.ts` for forbidden DOM read APIs (`getBoundingClientRect`, `getComputedStyle`, `offsetHeight`, `offsetWidth`, `clientHeight`, `clientWidth`, `scrollHeight`, `scrollWidth`, `window.getComputedStyle`). The only allowlisted pattern is `getElementsByTagName`, used by the `commitHydrate` marker scan. Comments and string literals are stripped before the scan so legitimate documentation does not trigger false positives.
- `charwidth-unified.test.ts` — verifies that text-measurement constants (`CHAR_WIDTH = 8`, `WORD_WRAP_FACTOR = 1.4`) live only in `src/render/engines/text-measure.ts`, the single source of truth. Any other file that defines `CHAR_WIDTH` or hardcodes `charWidth = <num>` fails the build.
- `engines-allocation-bounded.test.ts` — confirms the engines scratch pool stays bounded after many reflows (flex and grid pool sizes do not exceed `MAX_POOLED_ENTRIES = 32`, the same buffer is reused across calls, and the heap delta after 5000 reflows + forced GC stays under a 4 KB/call ceiling). A future change that leaks a scratch buffer (e.g. acquire without release) will fail this test by growing the pool past the bound or the heap linearly.

If a legitimate use case requires adding to the allowlist, document it with an inline comment in the source and update the corresponding test with justification — do not weaken the test silently.

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

- **Element belongs to Axiom tree: yes** → `on: { click: () => { signal.value++ } }`
- **Element belongs to Axiom tree: no (browser/external)** → `addEventListener` as explicit escape hatch
