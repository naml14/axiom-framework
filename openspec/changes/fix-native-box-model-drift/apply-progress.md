# Apply Progress: Fix Native Box Model Drift

## Status
8/8 tasks complete. Ready for verify.

## Completed Tasks

- [x] 1.1 Updated `src/ssr.ts` `renderNode` to append `box-sizing:border-box;margin:0;padding:0;` to the framework-managed style string, before user `attrs.style`.
- [x] 1.2 Portal children (`isPortalChild=true`) continue to skip the framework layout block — no border reset introduced.
- [x] 2.1 Added `applyFrameworkLayout(domEl, { x, y, width, height }, true)` call inside `hydrateNode` in `src/render/commit.ts`, after the portal early-return and before `sanitizeHydratedElementAttrs`.
- [x] 2.2 Portal handling returns early before the new call — CSS-managed portal children are unaffected.
- [x] 3.1 Extended SSR test "preserva estructura, attrs y classes, e incluye estilos de layout inline" to assert `box-sizing:border-box;margin:0;padding:0;` in the style and no `border:` / `border-width:` reset.
- [x] 3.2 Added new hydration test "commitHydrate applies box-sizing, margin, and padding resets to hydrated framework elements" in `tests/hydration.test.ts`.
- [x] 3.3 `bun test` ran: 574 pass, 2 skip, 0 fail (576 total).
- [x] 4.1 Diff confined to `src/ssr.ts`, `src/render/commit.ts`, `tests/ssr.test.ts`, `tests/hydration.test.ts`.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/ssr.ts` | Modified | Added `box-sizing:border-box;margin:0;padding:0;` to the framework-managed inline style string in `renderNode`. |
| `src/render/commit.ts` | Modified | Called `applyFrameworkLayout` for matched non-portal elements in `hydrateNode`. |
| `tests/ssr.test.ts` | Modified | Extended style regex assertion; added no-border-reset assertions. |
| `tests/hydration.test.ts` | Modified | Added test asserting `boxSizing`, `margin`, and `padding` are set on hydrated elements. |

## Deviations from Design
None — implementation matches design exactly.

## Issues Found
- happy-dom normalizes CSS `'0'` → `'0px'` for margin/padding; hydration test uses `.toMatch(/^0/)` to handle both.
