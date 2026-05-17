# Design: Unify Text Measurement

## Technical Approach

Create one pure helper in `src/render/engines/text-measure.ts` and replace the four local measurement formulas in `reflow.ts`, `fast-path.ts`, `flex.ts`, and `grid.ts`. The helper owns the shared constants (`charWidth=8`, `wordWrapFactor=1.4`) and returns dimensions only; callers keep existing responsibilities for reading prepared text and writing `LayoutResult` arrays. This maps directly to the spec requirements for shared constants, a stateless helper, consistent root-level text heights, and unchanged non-text layout math.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Helper location | Add `src/render/engines/text-measure.ts` | Host in `fast-path.ts`, `flex.ts`, or `grid.ts` | `fast-path.ts` already imports flex/grid, so hosting there risks cycles. A tiny sibling module keeps dependency direction simple. |
| Helper contract | `measureTextChild(text: string, font: FontData, wordWrap: boolean): { width: number; height: number }` | Pass `PreparedComponent` and mutate `LayoutResult` | The required API is stateless. Returning dimensions avoids side effects and makes direct unit testing trivial. |
| `FontData` shape | Export a local `FontData` with `{ availableWidth: number; lineHeight: number }` | Reuse prepare `font?: string`; introduce style parsing | Current measurement depends only on available width and line height. Parsing real font data is out of scope. |
| Text extraction | Keep existing `getTextHandle`/`getTextContent` fallback in each engine | Add a second shared prepared-node helper | The change is about measurement math, not prepared-node access. Keeping extraction local minimizes behavioral drift. |

## Data Flow

```text
Prepared text node
  └─ engine resolves text string + available width + line height
       └─ measureTextChild(text, { availableWidth, lineHeight }, true)
            └─ { width, height }
                 └─ caller writes result.width/result.height
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/render/engines/text-measure.ts` | Create | Export `FontData` and pure `measureTextChild`; centralize `charWidth=8` and `wordWrapFactor=1.4`. |
| `src/render/reflow.ts` | Modify | Replace `layoutText` formula (`charWidth=6`, no wrap factor) with shared helper output. |
| `src/render/engines/fast-path.ts` | Modify | Replace private `measureText` formula with direct shared helper call. |
| `src/render/engines/flex.ts` | Modify | Remove private duplicated `measureTextChild`; call shared helper directly. |
| `src/render/engines/grid.ts` | Modify | Remove private duplicated `measureTextChild`; call shared helper directly. |
| `tests/reflow.test.ts` | Modify | Add cross-engine consistency test covering root/reflow, fast-path stack, flex, and grid text measurement. |

## Interfaces / Contracts

```ts
export interface FontData {
  availableWidth: number
  lineHeight: number
}

export function measureTextChild(
  text: string,
  font: FontData,
  wordWrap: boolean
): { width: number; height: number }
```

For empty text, callers should preserve current behavior: only call/write dimensions when resolved text is non-empty.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Shared helper math | Assert width equals `availableWidth`; height uses `ceil((len / floor(width/8)) * 1.4) * lineHeight` when `wordWrap=true`. |
| Integration | Cross-engine consistency | In `tests/reflow.test.ts`, render identical text through root text, fast-path stack, flex, and grid paths; assert equal text heights and expected wrapped height. |
| Regression | Non-text layout math | Keep existing reflow/flex/grid tests unchanged; run `bun test tests/reflow.test.ts` then full `bun test`. |

## Migration / Rollout

No migration required. This is an internal layout measurement correction with no public API change.

## Open Questions

None.
