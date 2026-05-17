# Design: Fix Native Box Model Drift

## Technical Approach

Implement Approach A by aligning SSR and hydration with the existing client layout contract. `applyFrameworkLayout` already applies `position:absolute`, `boxSizing:border-box`, `margin:0`, `padding:0`, transform, width, and height for framework-managed DOM nodes in `commitFull`, updates, moves, and inserts. The design closes the two gaps where that contract is missing: the SSR inline style string in `src/ssr.ts`, and matched node initialization in `commitHydrate` in `src/render/commit.ts`.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Add reset declarations directly to the SSR inline layout string. | Inject a global `[data-axiom-id]` style rule; reset only via client hydration. | The proposal explicitly excludes global CSS, and inline SSR styles affect first paint before JavaScript runs. |
| Reuse `applyFrameworkLayout` during hydration. | Duplicate style writes in `hydrateNode`; wait for first diff/update to rewrite layout. | Reusing the existing helper keeps the layout contract in one place and prevents drift before the first client-side update. |
| Preserve portal CSS-managed behavior. | Apply resets to all hydrated marked nodes, including CSS-managed portal children. | Existing portal semantics skip framework layout for CSS-managed children; this change should only affect framework-managed elements. |
| Leave user `attrs.style` ordering after framework layout in SSR. | Put user styles before framework layout or sanitize/reset user box model values. | Existing SSR appends user style after framework layout. Keeping that order preserves current override behavior while adding safe defaults. |

## Data Flow

SSR path:

    prepare(component) -> reflow(prepared) -> renderNode()
      -> style="position:absolute;...;box-sizing:border-box;margin:0;padding:0;..."

Hydration path:

    commitHydrate(layout, prepared, root)
      -> map data-axiom-id to DOM elements
      -> hydrateNode(element)
      -> applyFrameworkLayout(domEl, layout slot, managedByFramework)
      -> attrs/listeners/text checks/children

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/ssr.ts` | Modify | Extend the framework-managed style string in `renderNode` with `box-sizing:border-box;margin:0;padding:0;` before appending user `attrs.style`. Portal children that are CSS-managed continue to skip framework layout styles. |
| `src/render/commit.ts` | Modify | In `hydrateNode`, after a matched non-portal element is found and before child traversal, call `applyFrameworkLayout(domEl, { x: layout.x[idx], y: layout.y[idx], width: layout.width[idx], height: layout.height[idx] }, true)` for normal framework-managed hydrated elements. Portal marker handling remains unchanged. |

## Interfaces / Contracts

No public API or type changes. The internal contract becomes:

```ts
applyFrameworkLayout(domEl, {
  x: layout.x[idx], y: layout.y[idx],
  width: layout.width[idx], height: layout.height[idx],
}, true)
```

SSR framework-managed element styles MUST include exactly the reset segment required by the spec: `box-sizing:border-box;margin:0;padding:0;`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | SSR style output includes box model resets and keeps native borders untouched. | Extend `tests/ssr.test.ts` style assertions to include the reset segment and no `border` reset. |
| Unit | Hydration applies layout resets to matched elements. | Extend `tests/hydration.test.ts` or `tests/commit.test.ts` to assert `boxSizing`, `margin`, and `padding` after `commitHydrate`. |
| Regression | Existing portal and hydration behavior still passes. | Run `bun test`, focusing on SSR, hydration, commit, and portal tests. |

## Migration / Rollout

No migration required. This is an internal rendering consistency fix and can be rolled back by reverting `src/ssr.ts` and `src/render/commit.ts`.

## Open Questions

None.
