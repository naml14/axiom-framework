# Exploration: Unify Text Measurement

## Problem
Text measurement logic was duplicated across three engines:
- `src/render/engines/fast-path.ts` (`measureText`)
- `src/render/engines/flex.ts` (`measureTextChild`)
- `src/render/engines/grid.ts` (`measureTextChild`)

Each had its own implementation with `charWidth=8` and `wordWrapFactor=1.4`, but the duplication created drift risk and violated DRY.

Additionally, `src/render/reflow.ts` had its own `layoutText` function with a different `charWidth=6` and no word-wrap factor — meaning text measured differently in the fast path vs flex/grid engines.

## Finding
The canonical implementation (fast-path + flex + grid) uses:
- `charWidth = 8`
- `wordWrapFactor = 1.4`

The `reflow.ts` implementation was inconsistent (`charWidth=6`, no wrap factor).

## Proposed Solution
Create `src/render/engines/text-measure.ts` with a single `measureTextChild` export.
All engines import from this shared module.
