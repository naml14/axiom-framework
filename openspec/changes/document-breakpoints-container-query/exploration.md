# Exploration: document-breakpoints-container-query

## Current State

Axiom's responsive breakpoint system is implemented across three files:

### `src/syntax/h.ts` — Syntax layer
`buildLayoutFromShortcuts()` parses the `at` prop (a `ResponsiveMap`) into an array of `LayoutBreakpoint` objects via `resolveAt()`.

```ts
const BREAKPOINT_PX: Readonly<Record<string, number>> = {
  sm: 480, md: 768, lg: 1024, xl: 1280,
}

function resolveAt(at: ResponsiveMap): LayoutProps['breakpoints'] {
  return Object.entries(at)
    .map(([key, overrides]) => ({
      minWidth: BREAKPOINT_PX[key] ?? Number(key),
      layout:   buildLayoutFromShortcuts(overrides as LayoutShortcuts) ?? {},
    }))
    .filter((breakpoint) => Number.isFinite(breakpoint.minWidth))
    .sort((a, b) => a.minWidth - b.minWidth)
}
```

The named tokens (`sm`, `md`, `lg`, `xl`) map to pixel thresholds. These thresholds are stored as `minWidth` in each `LayoutBreakpoint`.

### `src/render/strategy/responsive.ts` — Runtime evaluation
`mergeBreakpointOverrides()` iterates the sorted breakpoints and calls `matchesBreakpoint()`, which compares each breakpoint's `minWidth` against **`constraints.maxWidth`** — the **parent container's available width**, not the viewport width.

```ts
function mergeBreakpointOverrides(layout, constraints) {
  for (const breakpoint of breakpoints) {
    if (matchesBreakpoint(
      breakpoint.minWidth, breakpoint.maxWidth,
      breakpoint.minHeight, breakpoint.maxHeight,
      constraints.maxWidth,   // ← container width, not viewport
      constraints.maxHeight
    )) {
      Object.assign(merged, breakpoint.layout)
    }
  }
}
```

`LayoutConstraints` has two separate fields:
- `maxWidth / maxHeight` — the parent container's available space (always present)
- `viewportWidth / viewportHeight` — real viewport dimensions (optional, SSR/test use)

`vw`/`vh` units in `resolveLayoutDimension()` fall back to `maxWidth`/`maxHeight` when `viewportWidth`/`viewportHeight` are absent.

### `src/core/types.ts` — Type definitions
`LayoutConstraints`, `LayoutBreakpoint`, and `LayoutProps` define the contract. Nothing in the type signatures documents or enforces the container-query semantics.

---

## Affected Areas

- `src/syntax/h.ts` — `resolveAt()` and `BREAKPOINT_PX` define token-to-px mapping; needs a reference comment to the spec
- `src/render/strategy/responsive.ts` — `mergeBreakpointOverrides()` and `resolveLayoutDimension()` implement the semantics; needs reference comments
- `openspec/specs/responsive-breakpoints.md` — **does not exist**; must be created as the canonical source of truth
- `README.md` / `docs/COOKBOOK.md` — no usage example for `at` breakpoints

---

## Key Findings

1. **Container-query model is confirmed**: `matchesBreakpoint` receives `constraints.maxWidth` which is the parent container's allocated width from the layout engine, never the window viewport.

2. **Multiple simultaneous breakpoints are additive**: the loop `Object.assign(merged, breakpoint.layout)` applies ALL matching breakpoints in ascending `minWidth` order. Last write wins per key — effectively mobile-first cascade.

3. **`vw`/`vh` fallback is implicit**: when `viewportWidth` is `undefined` (SSR or no explicit constraint), `resolveLayoutDimension` falls back to `constraints.maxWidth`. This is undocumented and can surprise SSR users expecting real viewport sizes.

4. **Custom numeric breakpoints work**: `at: { '600': { ... } }` is supported via `Number(key)` in `resolveAt()`.

5. **No existing spec for responsive behavior** — this is a pure documentation gap, zero code changes needed.

---

## Approaches

### 1. Write spec + inline comments (recommended)
Create `openspec/specs/responsive-breakpoints.md` as the canonical spec, add reference comments in `h.ts` and `responsive.ts`, add a usage example in `docs/COOKBOOK.md`.

- **Pros**: Low effort, zero risk, all audiences covered (end-users via cookbook, contributors via spec + code comments)
- **Cons**: None meaningful
- **Effort**: Low

### 2. Write spec only
Only create the spec file, skip code comments and cookbook.

- **Pros**: Smaller surface
- **Cons**: End-users still won't discover it; contributors won't see the spec link in the code
- **Effort**: Very Low

### 3. Restructure docs with a dedicated responsive guide
Create a standalone `docs/RESPONSIVE.md` and cross-link from README.

- **Pros**: Better discoverability for end-users
- **Cons**: Duplicates spec; not in scope per the request; requires README changes
- **Effort**: Medium

---

## Recommendation

**Approach 1.** The scope is perfectly defined in the intent:
1. `openspec/specs/responsive-breakpoints.md` — the authoritative spec (container-query model, vw/vh fallback, simultaneous breakpoints)
2. Two short inline comments in `src/syntax/h.ts` and `src/render/strategy/responsive.ts` pointing to the spec
3. A cookbook entry in `docs/COOKBOOK.md` with a real-world example

No code changes, no breaking changes, minimal effort.

---

## Risks

- The `vw`/`vh` fallback to `maxWidth`/`maxHeight` may need a deliberate decision on whether to document it as "by design" or "a known limitation" — this should be resolved during the spec-writing phase.
- If future work changes container semantics (e.g., adding viewport-relative mode), the spec will need updating. Low risk for now.

---

## Ready for Proposal

**Yes.** The scope is clear, no ambiguity remains, all files are identified. The next phase is `sdd-propose` (or directly `sdd-spec` since the change is docs-only).
