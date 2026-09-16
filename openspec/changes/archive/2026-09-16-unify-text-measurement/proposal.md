# Proposal: Unify Text Measurement

## Intent
Eliminate duplicated text-measurement logic across layout engines by extracting a shared helper.

## Scope
- Create `src/render/engines/text-measure.ts`
- Refactor `src/render/engines/fast-path.ts`
- Refactor `src/render/engines/flex.ts`
- Refactor `src/render/engines/grid.ts`
- Refactor `src/render/reflow.ts` (align charWidth to 8 + word-wrap factor)

## Out of Scope
- Changing the measurement algorithm itself
- Adding font-metrics integration

## Approach
Pure function extraction. No behavioral change for engines already using charWidth=8.
The `reflow.ts` fast-path alignment to charWidth=8 is a bug fix (was 6).
