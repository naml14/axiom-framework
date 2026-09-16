# Proposal: Fix Native Box-Model Drift

## Intent
Ensure SSR output and hydration both produce consistent box-model resets, preventing layout drift from browser defaults.

## Scope
- `src/ssr.ts`: append `box-sizing:border-box;margin:0;padding:0;` to framework-managed inline styles
- `src/render/commit.ts`: call `applyFrameworkLayout` during hydration; merge user style instead of replacing
- `tests/ssr.test.ts`: assert reset styles in output
- `tests/hydration.test.ts`: add test that builds DOM without SSR, verifies commitHydrate applies layout

## Critical Fix (from Copilot review)
In `commitHydrate`, after calling `applyFrameworkLayout`, user attrs `style` must be MERGED onto existing layout styles, not replaced via `sanitizeHydratedElementAttrs`.
