# Proposal: Fix CSS Transform Animations

## Intent

Enable CSS transform animations to compose correctly with Axiom's layout engine without clobbering position styles, and provide a synchronous hook to detect and handle conflicts.

## Current Problem

Axiom's `applyFrameworkLayout` in `src/render/commit.ts` sets inline `transform: translate(x,y)` directly. Users who add CSS animations with traditional `@keyframes { ... transform: ... }` experience **element collapse** because CSS animation `transform` values override the inline `translate`, losing position math entirely.

Example: A dialog element animated with `scale()` loses its `translate()` during the animation.

## Proposed Solution

### Approach

1. **Composed Transform Contract**: Change the inline transform to `translate(Xpx, Ypx) var(--animation-transform)` so animations bind to the CSS variable instead of fighting the inline value.

2. **Conflict Hook**: Add optional `onTransformConflict` hook to detect when non-framework code tries to override the inline `transform`, enabling graceful handling or warnings.

3. **Important Override Preservation**: Respect user keyframes marked with `!important`, allowing intentional override of the composed transform while still firing the hook for observability.

4. **SSR Contract**: Emit the same composed transform from server-side rendering to avoid hydration drift.

### Scope

- **NEW**: `onTransformConflict?: TransformConflictHook` optional hook in `createApp` options
- **MODIFIED**: Inline transform composition in render/ssr paths
- **MODIFIED**: Tests to verify composed transform and hook behavior
- **NEW**: `docs/ANIMATIONS.md` migration guide

### Rollout / Breaking Change

**BREAKING for CSS**: Existing user keyframes using `transform` will need migration to `--animation-transform`. Axiom's composed transform takes precedence for non-important keyframes. This is intentional — users must explicitly migrate or use `!important`.

**NON-BREAKING for JS**: The `onTransformConflict` hook is optional. Existing `createApp()` calls remain valid.

## Rationale

- **Composability**: Animations should enhance layout, not break it. CSS variables provide a clean composition surface.
- **Ownership**: Axiom remains the source of truth for layout positioning while allowing user animations to layer on top.
- **Backwards Compatibility**: Hook is optional; docs provide clear migration path.
- **Observability**: Hook enables frameworks and apps to detect/log unintended overrides.

## Alternative Approaches

1. **Separate CSS custom properties (`--ax-x`, `--ax-y`)**: Avoided because it complicates layout math and still requires keyframe migration.
2. **Computed style inspection**: Avoided because it requires layout reads and isn't write-only per project patterns.
3. **Async warning queue**: Avoided because commit path must remain synchronous.

## Risks

- **Keyframe Migration**: User CSS must change. Mitigation: clear docs + runtime hook for detection.
- **Browser Animation Fill Modes**: Happy DOM doesn't simulate `animation-fill-mode: both|forwards`. Mitigation: manual browser verification documented in `docs/ANIMATIONS.md`.

## Timeline / Success Criteria

- ✅ All 15 implementation tasks complete
- ✅ No CRITICAL issues in verification
- ✅ Coverage > 85%
- ✅ All spec scenarios verified
