# Exploration: Support Layout Shortcuts

## Problem
`JustifyContent` type only had `'start' | 'center' | 'end' | 'space-between'`.
`AlignItems` type only had `'start' | 'center' | 'end' | 'stretch'`.

The shortcut types in `src/syntax/types.ts` already listed `space-around` and `baseline` as valid shortcut values, but the core types and engine implementations didn't support them.

Additionally, `VALID_JUSTIFY_VALUES` / `VALID_ALIGN_VALUES` in `src/syntax/h.ts` duplicated literal unions, creating drift risk between the shortcut type and the core type.

## Fix
1. Add `'space-around'` to `JustifyContent` in `src/core/types.ts`
2. Add `'baseline'` to `AlignItems` in `src/core/types.ts`
3. Export `VALID_JUSTIFY_VALUES` / `VALID_ALIGN_VALUES` arrays from `src/core/types.ts`
4. Implement `space-around` in `src/render/engines/flex.ts`
5. Implement `baseline` as center in `getCrossOffset` in flex.ts
6. Use the exported arrays in `src/syntax/h.ts` for validation
