# Design: Fix Native Box-Model Drift

## SSR Fix
Append resets directly to the style string in `renderNode`:
```ts
let style = `position:absolute;...;box-sizing:border-box;margin:0;padding:0;`
```

## Hydration Fix
In `hydrateNode` inside `commitHydrate`, for each element node:
1. Call `applyFrameworkLayout(domEl, { x, y, width, height }, true)` — applies position/transform/size
2. Extract `attrs.style` separately before calling `sanitizeHydratedElementAttrs`
3. Call `sanitizeHydratedElementAttrs` with attrs minus the `style` key
4. Merge user `style` string into existing `style` attribute (append, don't replace)

This ensures:
- Framework layout styles are always applied
- User inline styles are additive, not destructive
- Box-model resets set by `applyFrameworkLayout` survive the user style merge
