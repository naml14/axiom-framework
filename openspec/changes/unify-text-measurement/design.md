# Design: Unify Text Measurement

## Architecture
Extract shared helper as a pure function module at `src/render/engines/text-measure.ts`.

### measureTextChild signature
```ts
export function measureTextChild(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void
```

### Constants
- `CHAR_WIDTH = 8`
- `WORD_WRAP_FACTOR = 1.4`

### Behavior
1. Resolve text from `getTextHandle` (prefer) or `getTextContent` (fallback)
2. If text is non-empty: `charsPerLine = floor(availableWidth / CHAR_WIDTH)`
3. `lineCount = max(1, ceil((text.length / charsPerLine) * WORD_WRAP_FACTOR))`
4. Write `result.height[idx]` and `result.width[idx]`

## Decision
All three engines (fast-path, flex, grid) plus reflow.ts use this single implementation.
