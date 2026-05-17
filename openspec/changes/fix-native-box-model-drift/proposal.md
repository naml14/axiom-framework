# Proposal: Fix Native Box Model Drift

## Intent

To prevent layout shifts and visual drift caused by user-agent (UA) default styles (`margin`, `padding`, `box-sizing`) during Server-Side Rendering (SSR) and hydration. Currently, the framework's absolute layout engine resets these values on the client, but the SSR output and hydration path omit them, leading to Cumulative Layout Shift (CLS) on first paint.

## Scope

### In Scope
- Add missing reset styles (`box-sizing: border-box`, `margin: 0`, `padding: 0`) to the SSR inline style string.
- Call `applyFrameworkLayout` during the hydration process (`commitHydrate`) to ensure re-hydrated elements receive the same reset styles before the first client-side update.

### Out of Scope
- Resetting native `border` on form controls (e.g., `<input>`, `<fieldset>`).
- Injecting a global `<style>` tag or CSS rule for `[data-axiom-id]`.
- Modifying CSS-managed portals.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- None

## Approach

We will follow Approach A:
1. Update `src/ssr.ts` to append `box-sizing:border-box;margin:0;padding:0;` to the inline style string generated for framework-managed elements.
2. Update `commitHydrate` in `src/render/commit.ts` to invoke `applyFrameworkLayout(domEl, layoutData, true)` on matched DOM elements during hydration.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/ssr.ts` | Modified | Add reset styles to SSR inline style string |
| `src/render/commit.ts` | Modified | Call `applyFrameworkLayout` in `hydrateNode` during `commitHydrate` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Style mutation on already correct elements during hydration | Low | `applyFrameworkLayout` style updates are idempotent; rewriting identical values has no rendering penalty. |
| Specific element styling issues (e.g., form borders) | Low | Leave native borders intact; rely on users specifying `border: 0` if needed, matching current behavior. |

## Rollback Plan

Revert the changes to `src/ssr.ts` and `src/render/commit.ts` using `git revert`, falling back to the current behavior where UA styles temporarily override the layout engine until the first client-side update.

## Dependencies

- None

## Success Criteria

- [ ] SSR HTML output includes `box-sizing`, `margin`, and `padding` resets for framework elements.
- [ ] Elements hydrated on the client do not exhibit visual drift or Cumulative Layout Shift (CLS) on first paint.
- [ ] Existing tests for layout and SSR rendering pass without regression.
