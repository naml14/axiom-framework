# Proposal: Support Layout Shortcuts

## Intent
Add `space-around` justify and `baseline` align to the Axiom layout engine.

## Scope
- `src/core/types.ts`: extend types + export validation arrays
- `src/render/engines/flex.ts`: implement space-around, baseline
- `src/syntax/h.ts`: use exported arrays, remove duplication

## Critical Fix (from Gemini + Copilot reviews)
`space-around` must include `gap` in per-item offset:
```ts
// CORRECT
mainOffset += axis.main(item.size) + gap + spacePerItem
```
`freeSpace` is calculated after subtracting gaps, so gap must be added back.
