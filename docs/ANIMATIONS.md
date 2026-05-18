# CSS Transform Animations

Axiom positions every element using an inline `transform` property:

```
translate(Xpx, Ypx) var(--animation-transform)
```

The `var(--animation-transform)` slot is reserved for animation libraries and user keyframes.
When `--animation-transform` is not set on the element, the variable resolves to the initial
value `none`, so layout is unaffected.

## Migrating from `transform` keyframes

**Before (conflicts with Axiom layout):**

```css
@keyframes enter {
  from { transform: scale(0.95); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
```

**After (composable with Axiom):**

```css
@keyframes enter {
  from { --animation-transform: scale(0.95); opacity: 0; }
  to   { --animation-transform: scale(1);    opacity: 1; }
}
```

Apply the animation as usual:

```css
.my-element {
  animation: enter 200ms ease forwards;
}
```

Axiom writes `translate(Xpx, Ypx) var(--animation-transform)` on every commit, so the
animation value is automatically composed with the layout position.

## Detecting conflicts

Pass `onTransformConflict` to `createApp` to detect legacy keyframes at runtime:

```ts
import { createApp } from 'axiom-framework'

const app = createApp(App, root, {
  onTransformConflict(element, conflictingTransform) {
    console.warn(
      '[Axiom] Conflicting transform detected on element. ' +
      'Migrate keyframes to use --animation-transform.',
      { element, conflictingTransform }
    )
  },
})
```

The hook fires **synchronously** during the commit phase, before Axiom overwrites the value.

## `!important` overrides

If your keyframe uses `!important` on `transform`, Axiom will fire `onTransformConflict` but
**will not overwrite the value**. The user-declared priority wins:

```css
@keyframes legacy {
  to { transform: scale(1) !important; }
}
```

This escape hatch should only be used when migrating a large codebase incrementally.
Prefer migrating to `--animation-transform` for correct composition.

## Manual browser verification

The following behaviors require a real browser environment and cannot be tested in jsdom/happy-dom:

- `animation-fill-mode: both` — element must retain both the Axiom translate and the final
  animation value after the animation ends.
- `animation-fill-mode: forwards` — the Axiom layout translate must be preserved after the
  animation completes.
- Multi-layer keyframe sequences that mutate `--animation-transform` across frames.

To verify, open `demo/` in a browser and run the transform animation smoke test included there.
