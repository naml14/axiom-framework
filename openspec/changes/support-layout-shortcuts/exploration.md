## Exploration: support-layout-shortcuts

### Current State

The shortcut layer (`src/syntax/types.ts`) already accepts `'space-around'` for `justify` and `'baseline'` for `align`:

```ts
justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'
align?:   'start' | 'center' | 'end' | 'stretch' | 'baseline'
```

These values flow through `buildLayoutFromShortcuts` in `src/syntax/h.ts` and are cast:

```ts
layout.justifyContent = justify as LayoutProps['justifyContent']
layout.alignItems     = align   as LayoutProps['alignItems']
```

The `as` casts are a smell: the comment on line 330 literally says _"El tipo de justifyContent en LayoutProps no incluye 'space-around'"_. The values are accepted syntactically but silently have no effect at runtime.

**Core types** (`src/core/types.ts`):

```ts
export type JustifyContent = 'start' | 'center' | 'end' | 'space-between'
export type AlignItems     = 'start' | 'center' | 'end' | 'stretch'
```

Neither `space-around` nor `baseline` is present.

**Flex engine** (`src/render/engines/flex.ts`):

- `justifyContent` handled at lines 232–250: `center`, `end`, `space-between` explicit; everything else falls through to `start` (default). `space-around` is silently ignored.
- `alignItems` handled in `getCrossOffset` (line 285–300): `center`, `end` explicit; everything else returns `padding` offset (= `start`). `baseline` is silently ignored.

**Grid engine** (`src/render/engines/grid.ts`):

- Grid does **not** use `justifyContent` or `alignItems` at all — items are placed by grid coordinates only. `space-around` and `baseline` would only affect children within a flex container that happens to be a grid cell, handled recursively by flex.

### Affected Areas

- `src/core/types.ts` — `JustifyContent` and `AlignItems` type unions must be extended.
- `src/syntax/h.ts` — the `as` casts become clean once core types include the values; comment can be removed.
- `src/render/engines/flex.ts` — `measureFlex` justify branch + `getCrossOffset` align branch need new cases.
- `src/render/engines/grid.ts` — grid does not do alignment distribution; **no engine change needed**. However, if the scope document intends tests for grid children using `baseline`/`space-around` inside a nested flex, those are already covered transitively.
- `openspec/specs/layout-shortcuts-contract.md` — new spec file.
- `tests/` — new test coverage for flex engine behavior; grid tests only for the "grid child that uses flex shortcuts" path if desired.

### Approaches

1. **Extend types + implement in flex only**
   - Add `'space-around'` to `JustifyContent`, `'baseline'` to `AlignItems` in `types.ts`.
   - Remove the `as` casts in `h.ts` (now type-safe by construction).
   - Add `space-around` branch in `measureFlex`: distribute free space evenly around each item — gap between edges and first/last item is half of gap between items (standard CSS `justify-content: space-around`).
   - Add `baseline` branch in `getCrossOffset`: in the MVP, treat as `start` (baseline alignment requires font metrics which Axiom doesn't track). Document this intentional degradation.
   - Add unit tests in a new `tests/engines/flex.test.ts` (and optionally `grid.test.ts` if grid-cell shortcut integration is tested).
   - Pros: minimal, type-safe, no breaking changes, honest about baseline limitation.
   - Cons: `baseline` degrades silently to `start` — must be documented explicitly.
   - Effort: **Low**

2. **Implement baseline via cross-axis midpoint approximation**
   - Approximate baseline as `center` (midpoint of text line height), which is closer than `start` for single-line text.
   - Pros: better visual result for typical text items.
   - Cons: introduces a heuristic that diverges from CSS spec; creates inconsistency when items have different heights.
   - Effort: **Low** (same as option 1 with one line change in `getCrossOffset`)

3. **Full CSS baseline tracking**
   - Track per-item ascent/descent during `measureTextChild` and store in `LayoutResult`.
   - Pros: spec-accurate.
   - Cons: requires extending `LayoutResult` (breaking buffer structure), adds complexity to all text measurement paths. Overkill for current scope.
   - Effort: **High**

### Recommendation

**Option 1 with Option 2's `baseline` handling**: treat `baseline` as `center` (not `start`) with a documented approximation note. In single-line scenarios this is visually closer to CSS baseline intent, and the approximation is honest — it is explicitly documented in the spec and in code comments. The type system gap is fully closed with no `as` casts.

`space-around` implementation is straightforward:
- For N items with free space F: edge gap = F/(2N), inter-item gap = F/N.
- Formula: `mainOffset += freeSpace / (2 * items.length)` then advance by `size + freeSpace / items.length`.

`baseline` for the grid engine: no change needed. Grid places items by cell coordinates. `alignItems` on a grid container has no effect in Axiom's engine today (the grid engine ignores it entirely). This is in-scope to document but not to change.

### Risks

- **Type widening**: adding values to `JustifyContent`/`AlignItems` is not breaking because all consumers that exhaustively switch must add new cases — but Axiom's flex engine uses `if/else if` chains not `switch`, so there is no TypeScript exhaustiveness error. Must rely on tests.
- **space-around with 1 item**: F/(2×1) = F/2 offset both sides — item is centered. This is correct per CSS spec.
- **space-around with 0 items**: loop never runs, safe.
- **baseline degradation**: if a future change adds real baseline tracking, the `center` approximation must be replaced. The spec must document this as an intentional temporary behavior to avoid silent drift.

### Ready for Proposal

Yes. Scope is well-defined, risk is low, approach is clear. Proceed to `sdd-propose`.
