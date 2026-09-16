# Exploration: Fix Native Box-Model Drift

## Problem
SSR (`src/ssr.ts`) generated inline styles without `box-sizing:border-box;margin:0;padding:0;`.
This caused layout drift when browsers applied default box-model to SSR-rendered elements.

Hydration (`src/render/commit.ts`) called `sanitizeHydratedElementAttrs(domEl, getAttrs(node))` which set `domEl.style` — replacing the entire inline style and wiping out any layout resets that `applyFrameworkLayout` might have applied.

Additionally, `commitHydrate` never called `applyFrameworkLayout`, so hydrated elements had no position/transform/size styles applied by the framework.

## Hydration test false positive
The hydration tests passed even though `commitHydrate` didn't apply layout resets, because SSR already injected them in the HTML. The fix: build DOM manually without SSR, then verify `commitHydrate` applies the resets.
