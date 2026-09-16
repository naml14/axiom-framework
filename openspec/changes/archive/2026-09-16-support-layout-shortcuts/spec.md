# Spec: Support Layout Shortcuts

## Requirements

### R1: space-around distributes equal space around items
Given 3 items of height 50 in a column of height 300 with gap=0:
- freeSpace = 300 - 150 = 150, spacePerItem = 50
- item[0].y = 25, item[1].y = 125, item[2].y = 225

### R2: space-around includes gap
With gap=10, item positions include gap between items.

### R3: baseline aligns like center
`align: 'baseline'` produces same y-offset as `align: 'center'` for the layout engine.

### R4: VALID_* arrays exported from core
`VALID_JUSTIFY_VALUES` and `VALID_ALIGN_VALUES` are exported from `src/core/types.ts`.
`src/syntax/h.ts` uses them for validation instead of inline literals.

### R5: Invalid shortcuts silently ignored
`justify: 'invalid'` → `justifyContent` is undefined (no error thrown).
