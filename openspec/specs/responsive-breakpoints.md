# Spec: Responsive Breakpoints (Container Query Model)

**Status**: Canonical  
**Change**: document-breakpoints-container-query  
**Source**: `openspec/changes/document-breakpoints-container-query/specs/responsive-breakpoints/spec.md`

---

## Overview

Axiom's responsive breakpoint system operates as a **container-query model**, not a viewport-based media-query model. Breakpoints are evaluated against the parent container's available dimensions (`maxWidth` / `maxHeight`) as supplied by the reflow engine — never via DOM reads or `window` measurements.

This model makes layouts deterministic: the same component produces the same layout result in SSR, testing, and DOM environments whenever the container constraints are identical.

---

## Requirement 1: Container-Query Resolution

Breakpoints MUST be resolved against the parent container's available width (`maxWidth`), not the absolute viewport width.

### Scenario 1.1 — Breakpoints apply based on container width, not viewport

- **GIVEN** a layout block with `at: { md: { flex: 'row' } }`
- **WHEN** the component is rendered inside a parent container narrower than the `md` breakpoint (768 px)
- **THEN** the `md` properties MUST NOT apply, even if the device viewport is wider than 768 px

### Implementation reference

- `src/syntax/h.ts` → `resolveAt()` converts named keys (`sm`, `md`, `lg`, `xl`) to `minWidth` values using `BREAKPOINT_PX` (`sm: 480`, `md: 768`, `lg: 1024`, `xl: 1280`) and stores the result in `LayoutProps.breakpoints`.
- `src/render/strategy/responsive.ts` → `mergeBreakpointOverrides()` applies each breakpoint whose `minWidth`/`maxWidth`/`minHeight`/`maxHeight` constraints are satisfied by `LayoutConstraints.maxWidth` and `LayoutConstraints.maxHeight` — container values supplied by reflow, not the browser viewport.

---

## Requirement 2: Viewport Unit Fallback

The system MUST fall back to using the container size for `vw` and `vh` units when explicit viewport dimensions are not provided to the renderer.

### Scenario 2.1 — `vw` resolution without explicit `viewportWidth`

- **GIVEN** a layout definition using `vw` units (e.g. `width: '50vw'`)
- **WHEN** `viewportWidth` is not explicitly passed to the renderer
- **THEN** the system MUST resolve `vw` relative to the current container's width, effectively treating it as a container-query unit

### Scenario 2.2 — `vh` resolution without explicit `viewportHeight`

- **GIVEN** a layout definition using `vh` units (e.g. `height: '100vh'`)
- **WHEN** `viewportHeight` is not explicitly passed to the renderer
- **THEN** the system MUST resolve `vh` relative to the current container's height

### Implementation reference

`src/render/strategy/responsive.ts` → `resolveLayoutDimension()`:

```ts
if (unit === 'vw') {
  const viewportWidth = constraints.viewportWidth ?? constraints.maxWidth
  return (viewportWidth * magnitude) / 100
}
const viewportHeight = constraints.viewportHeight ?? constraints.maxHeight
return (viewportHeight * magnitude) / 100
```

The `??` fallback is intentional and by design. It enables deterministic SSR and unit testing without requiring a real browser viewport.

---

## Requirement 3: Additive Cascade

The system MUST apply layout properties additively across multiple matching breakpoints. When two breakpoints both match and define the same property, the **largest matching breakpoint** (most specific) MUST win.

### Scenario 3.1 — Conflicting breakpoints resolution

- **GIVEN** a block with `at: { md: { flex: 'row' }, lg: { flex: 'column' } }`
- **WHEN** the container width satisfies both `md` (≥ 768 px) and `lg` (≥ 1024 px) thresholds
- **THEN** `flex: 'column'` from `lg` MUST override `flex: 'row'` from `md`
- **AND** any non-conflicting properties from both breakpoints MUST be merged additively

### Implementation reference

`src/syntax/h.ts` → `resolveAt()` sorts breakpoints ascending by `minWidth` before storing them. `src/render/strategy/responsive.ts` → `mergeBreakpointOverrides()` applies matching breakpoints in sorted order via `Object.assign(merged, breakpoint.layout)`, so later (larger) breakpoints overwrite earlier (smaller) ones for conflicting keys while preserving non-conflicting keys.

---

## Named Breakpoint Reference

| Key  | `minWidth` (px) |
|------|-----------------|
| `sm` | 480             |
| `md` | 768             |
| `lg` | 1024            |
| `xl` | 1280            |

Numeric keys are also accepted: `at: { 600: { gap: 8 } }` maps to `minWidth: 600`.

---

## Public API Contract

```ts
// Named breakpoints
h('div', {
  at: {
    md: { flex: 'row', gap: 16 },
    lg: { padding: 32 },
  }
})

// Numeric breakpoints
h('div', {
  at: {
    600: { gap: 8 },
    900: { gap: 16 },
  }
})
```

Key rules:
- `at` keys are normalized before rendering — consumers SHOULD use named keys for readability.
- Matching uses `LayoutConstraints.maxWidth` supplied by the reflow engine, not `window.innerWidth`.
- `vw`/`vh` inside `at` overrides follow the same fallback rule as top-level dimensions.
