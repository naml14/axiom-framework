# Proposal: fix-css-transform-animations

## Intent
Fix CSS animations that override Axiom's inline `transform` positioning due to `animation-fill-mode: both`/`forwards`. These animations write inline `transform` styles, clobbering Axiom's `translate(Xpx, Ypx)` and collapsing animated elements to (0,0).

## Scope

### In Scope
- Core: Change `applyFrameworkLayout` to compose transforms: `translate(Xpx, Ypx) var(--animation-transform)`.
- API: Add `onTransformConflict(element, animationTransform)` hook for conflict notification.
- Docs: Create `docs/ANIMATIONS.md` with migration guide for existing keyframes.
- Tests: Cover `fill-mode: both`, `forwards`, keyframes composition, and `!important` wins.

### Out of Scope
- Polyfills for old browsers lacking CSS variable support.
- Non-transform CSS property conflicts (e.g., opacity).

## Capabilities

### New Capabilities
- `transform-animations`: Support for CSS transform animations that compose correctly with layout engine positioning, and detection of conflicts.

### Modified Capabilities
- None

## Approach
Axiom currently applies inline `transform` to position elements. When a CSS animation uses `transform` with `fill-mode: forwards|both`, the animation's transform completely overrides the inline style.
By switching Axiom's positioning logic in `applyFrameworkLayout` to use a composition like `translate(Xpx, Ypx) var(--animation-transform)`, we allow CSS keyframes to animate `--animation-transform` instead. 
Additionally, we will add an `onTransformConflict` hook to notify developers when an element has a traditional `transform` animation that might conflict, so they can migrate it to the variable. `!important` in keyframes will override Axiom transforms.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| Core (e.g. `commit.ts`) | Modified | Update `applyFrameworkLayout` transform composition logic |
| API | Modified | Add `onTransformConflict` hook (must be synchronous) |
| `docs/ANIMATIONS.md` | New | Migration guide for existing keyframes |
| Tests | New | Cover `fill-mode`, composition, `!important` overrides |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing animations | High | Provide clear `docs/ANIMATIONS.md` migration guide; use `onTransformConflict` to warn. |
| Performance hit on layout apply | Low | `var(--animation-transform)` composition is generally fast, but verify frame budgets. |
| Hook adds latency to commit phase | Medium | Ensure `onTransformConflict` hook is strictly synchronous (no async in commit). |

## Rollback Plan
- Revert the transform composition logic in `commit.ts`.
- Restore manual `transform` migrations in user keyframes.

## Dependencies
- None.

## Success Criteria
- [ ] CSS animations using `--animation-transform` animate correctly from the layout-positioned `translate`.
- [ ] Elements no longer collapse to (0,0) when animated.
- [ ] `onTransformConflict` fires synchronously when conflicting keyframes are detected.
- [ ] Existing `!important` keyframe overrides still function (intentional override).
