# Design: Fix CSS Transform Animations

## Technical Approach

Update the render commit contract so framework layout always writes a composed transform, `translate(Xpx, Ypx) var(--animation-transform)`, while preserving the existing x/y/width/height math. Add a synchronous conflict hook that is passed from `createApp` options into commit operations and fires before Axiom overwrites a non-framework-owned inline transform. SSR must emit the same composed transform to avoid hydration drift.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Transform composition | Write one inline composed transform string from layout: `translate(${x}px,${y}px) var(--animation-transform)` | CSS `translate` property; separate `--ax-x`/`--ax-y` variables | Keeps current layout math and browser target, avoids CSSOM reads, and gives users one migration target for keyframes. |
| Conflict ownership | Store the last Axiom-written transform on the element with a private symbol/property and compare before overwrite | Compare to computed style; parse active CSS animations | Existing project prioritizes write-only commit paths. Ownership tracking detects direct/filled inline conflicts without layout reads. |
| Hook surface | Add `onTransformConflict?: (element: HTMLElement, animationTransform: string) => void` to app/commit options | Plugin lifecycle hook; async warning queue | Commit needs immediate synchronous notification. Optional options avoid breaking existing calls. |
| `!important` handling | If current inline `transform` priority is `important`, fire the hook and do not overwrite it | Always overwrite; set Axiom transform as important | User-declared important transform must intentionally override Axiom composition. Axiom must not escalate priority. |

## Data Flow

    createApp(options.onTransformConflict)
      └─→ commitFull/applyOps/commitHydrate commit options
            └─→ applyFrameworkLayout(element, layout, managed, hooks)
                  ├─ compare current inline transform with last Axiom transform
                  ├─ call hook synchronously on conflict
                  └─ write composed transform unless current transform is !important

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/render/commit.ts` | Modify | Add commit hook options, composed transform helper, ownership tracking, conflict detection, and important override behavior. |
| `src/app.ts` | Modify | Add `onTransformConflict` to `AppOptions` and pass it into full, incremental, and hydration commits. |
| `src/core/types.ts` | Modify | Export `TransformConflictHook` and shared commit option shape if kept in core foundation types. |
| `src/index.ts` | Modify | Re-export the new public hook type. |
| `src/ssr.ts` | Modify | Emit composed transform in server-rendered layout styles. |
| `tests/commit.test.ts` | Modify | Update transform expectations and add sync hook, conflict, and `!important` tests. |
| `docs/ANIMATIONS.md` | Create | Migration guide from `transform` keyframes to `--animation-transform`. |

## Interfaces / Contracts

```ts
export type TransformConflictHook = (
  element: HTMLElement,
  animationTransform: string,
) => void

export interface CommitOptions {
  onTransformConflict?: TransformConflictHook
}
```

`applyFrameworkLayout` remains internal. Public callers get optional parameters only, so existing call sites remain valid. The hook must be invoked directly in the same call stack; thrown hook errors propagate through the existing commit error path.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Composed transform output | Update `commitFull`, `applyOps`, portal `cssManaged:false`, and hydration expectations. |
| Unit | Synchronous hook | Mutate an element transform, call `applyOps`, assert hook called before final transform write. |
| Unit | `!important` override | Set `el.style.setProperty('transform', value, 'important')`, apply layout, assert value/priority remain and hook fires. |
| Integration | `createApp` option wiring | Mount/update with `onTransformConflict` and verify the callback receives the element and prior transform. |
| E2E | Browser animation fill modes | Not available in current OpenSpec config; document manual/browser verification in `docs/ANIMATIONS.md`. |

## Migration / Rollout

No data migration required. Existing transform keyframes should migrate from `transform` to `--animation-transform`:

```css
@keyframes enter {
  from { --animation-transform: scale(.95); }
  to { --animation-transform: scale(1); }
}
```

## Open Questions

- [ ] None.
