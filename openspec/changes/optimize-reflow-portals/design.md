# Design: Optimize Reflow Portals

## Technical Approach

Remove the unreachable portal branch from `src/render/reflow.ts:layoutNode` and leave the live portal flow unchanged. The primary pass continues to route normal nodes through `measureSimple`, `measureFlex`, or `measureGrid`; those engines already skip portal children. The secondary `reflowPortalChildren()` traversal remains the single place that lays out `cssManaged:false` portal children. The render pipeline spec will describe that split explicitly so future work does not reintroduce duplicate portal paths.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Portal layout authority | Keep `reflowPortalChildren()` as the only portal-child layout path | Move portal handling into `layoutNode` or the layout engines | Engines intentionally skip portals, so the current `layoutNode` portal branch is dead. Keeping the secondary pass avoids behavior changes. |
| Scope of code change | Delete only the `nodeType === 'portal'` block in `layoutNode` | Refactor `measureSimple`, `measureFlex`, or `measureGrid` | The requirement is cleanup, not a layout architecture migration. Engine behavior must remain unchanged. |
| Public API | Do not change `PortalProps`, `createPortal`, or `cssManaged` semantics | Add new portal flags or change defaults | Portal behavior is already covered by `cssManaged`; this change removes unreachable internals only. |
| Spec update | Document primary-pass portal skipping plus secondary-pass unmanaged portal layout | Document a unified single-pass model | The codebase uses a two-pass portal model today; the spec must match actual behavior. |

## Data Flow

```text
reflow(prepared)
  ├─ layoutNode(root)
  │    └─ measureSimple / measureFlex / measureGrid
  │         └─ skip portal children, portal slot remains 0x0
  └─ reflowPortalChildren(root)
       └─ for cssManaged:false portal children only: layoutNode(child)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/render/reflow.ts` | Modify | Remove the dead `if (nodeType === 'portal')` block from `layoutNode`; keep `reflowPortalChildren()` unchanged. |
| `openspec/specs/render-pipeline.md` | Create/Modify | Record that portals are skipped by primary layout engines and unmanaged portal children are handled only by the secondary pass. |
| `tests/portal.test.ts` | No planned edit | Existing portal regression tests already cover portal slots, CSS-managed children, and `cssManaged:false` layout. |

## Interfaces / Contracts

No new interfaces or public contracts. `PortalProps`, `createPortal()`, `getPortalCssManaged()`, and the public portal API remain unchanged.

Internal contract after cleanup:

```ts
reflow() = layoutNode(root) + reflowPortalChildren(root)
```

`layoutNode()` is responsible for non-portal layout. `reflowPortalChildren()` is responsible for `cssManaged:false` portal child layout.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Portal slot remains 0x0 and default portal children remain CSS-managed | Run existing `tests/portal.test.ts` cases around `reflow — portal layout` and CSS-managed defaults. |
| Integration | `cssManaged:false` portal children still receive computed dimensions | Run existing `reflow — cssManaged:false portal children participate in layout` cases. |
| Regression | No engine behavior drift | Run full `bun test`; no changes expected in `measureSimple`, `measureFlex`, or `measureGrid`. |

## Migration / Rollout

No migration required. This is an internal dead-code removal plus spec clarification with no runtime or API migration.

## Open Questions

None.
