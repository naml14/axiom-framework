# Exploration: unify-text-measurement

## Current State

Axiom's layout pipeline has **four** text measurement sites spread across three files. Three of them are consistent; one is a silent regression:

| File | Function | charWidth | word-wrap factor |
|------|----------|-----------|-----------------|
| `src/render/reflow.ts` | `layoutText()` | **6** ❌ | **none** ❌ |
| `src/render/engines/fast-path.ts` | `measureText()` | 8 ✅ | 1.4× ✅ |
| `src/render/engines/flex.ts` | `measureTextChild()` | 8 ✅ | 1.4× ✅ |
| `src/render/engines/grid.ts` | `measureTextChild()` | 8 ✅ | 1.4× ✅ |

`layoutText` in `reflow.ts` is the **top-level fallback** invoked for leaf `text` nodes that have no children (`layoutNode` → `layoutText`, line 121). All other engines route through `measureSimple` / `measureFlex` / `measureGrid`, which in turn call their own local `measureText` / `measureTextChild`. The result: a text node at the root of a simple component gets measured with `charWidth=6` and no word-wrap factor, while the exact same text node nested inside a flex/grid container gets measured with `charWidth=8` and `1.4×`. This produces **different heights for identical text** depending on container type.

Additionally, `measureTextChild` in `flex.ts` (lines 301–323) and `grid.ts` (lines 655–677) are **byte-for-byte identical**. `fast-path.ts:measureText` (lines 102–127) is the same logic with an extra inline comment. All three are private module functions — none are exported.

### Call graph (simplified)

```
reflow()
  └─ layoutNode()
       ├─ layoutText()            ← charWidth=6, no 1.4× (BUG)
       ├─ measureSimple()
       │    └─ layoutChild()
       │         └─ measureText() ← charWidth=8, 1.4×
       ├─ measureFlex()
       │    └─ measureTextChild() ← charWidth=8, 1.4×
       └─ measureGrid()
            └─ measureTextChild() ← charWidth=8, 1.4×
```

### Existing tests

- `tests/reflow.test.ts` line 85: comment says "at 6px/char" but the assertion (`height = 20`, one line for "Hello" with `maxWidth=500`) passes with ANY charWidth — the text fits regardless.
- `tests/reflow.test.ts` lines 89–98: **already uses charWidth=8 math** (comment: "Fast-path uses charWidth=8 with 1.4× word-wrap factor"). The test expects 120px and the assertion would FAIL against the current `layoutText` (charWidth=6 → 1 line → 20px). This test appears to be written for the target state — it currently exercises the **fast-path** code path, not `layoutText`.
- No cross-engine comparison test exists (same text, different container type → assert same height).

## Affected Areas

- `src/render/reflow.ts` — `layoutText()` (lines 194–217): fix `charWidth=6` → `8`, add `1.4×` word-wrap factor
- `src/render/engines/fast-path.ts` — `measureText()` (lines 102–127): refactor to call shared helper (or export the helper)
- `src/render/engines/flex.ts` — `measureTextChild()` (lines 301–323): replace with shared helper call
- `src/render/engines/grid.ts` — `measureTextChild()` (lines 655–677): replace with shared helper call
- `openspec/specs/text-measurement.md` — new spec file documenting the canonical model
- `tests/reflow.test.ts` — update stale comment on line 85; add cross-engine test

## Approaches

### 1. Inline fix only (minimal)
Fix `charWidth` and add `1.4×` in `layoutText()` only. Leave duplication in place.
- **Pros**: Smallest diff (2 lines), zero refactor risk, passes CI immediately.
- **Cons**: Four copies still live. Next drift is guaranteed. No shared owner.
- **Effort**: Low

### 2. Extract shared helper to `fast-path.ts` (export `measureTextChild`)
Export `measureTextChild` from `fast-path.ts`, import it in `flex.ts`, `grid.ts`, and `reflow.ts`.
- **Pros**: Single source of truth, all four callers share one implementation, DRY.
- **Cons**: `fast-path.ts` already exports `measureSimple`; adding `measureTextChild` is natural. Minor import cycle risk (flex imports fast-path which imports flex? No — fast-path imports flex, so we must NOT put the helper in fast-path or it creates a cycle with flex/grid). **Requires a new file.**
- **Effort**: Low–Medium

### 3. Extract shared helper to a new `src/render/engines/text-measure.ts`
Create `src/render/engines/text-measure.ts` exporting `measureTextContent()`. All four callers import from it.
- **Pros**: Clean separation, no cycle risk, discoverable. Aligns with the spec's goal of a canonical model.
- **Cons**: New file — slightly more surface area. Trivial to implement.
- **Effort**: Low–Medium

## Recommendation

**Approach 3** — new `src/render/engines/text-measure.ts`.

Rationale:
- Approach 1 leaves the duplication and defers the next inevitable inconsistency.
- Approach 2 cannot use `fast-path.ts` as the host without an import cycle (fast-path imports flex and grid).
- Approach 3 introduces zero coupling, zero cycle risk, and gives the canonical model a named, findable home — consistent with the spec creation goal.

The fix to `reflow.ts:layoutText` is a **behavior change**: `charWidth 6→8` shifts the height of root-level text nodes. The `1.4×` factor adds a small additional multiplier. Both changes make `layoutText` consistent with every other engine — the current state is the bug.

## Risks

- **Test assertions on line 85**: The comment is stale ("6px/char") but the assertion (`height=20`) holds at any charWidth for short text. Update the comment only.
- **Behavior change in `layoutText`**: Consumers relying on `charWidth=6` computed heights for root-level text will see different values. This is the *correct* value. No public API changes.
- **Import graph**: `text-measure.ts` must import only from `../prepare.js` and `../../core/types.js` to stay leaf-level. Any deviation creates coupling risk.

## Ready for Proposal

Yes — scope is fully understood. Recommended implementation path: Approach 3 with strict TDD (fix test comment, add cross-engine test, then implement).
