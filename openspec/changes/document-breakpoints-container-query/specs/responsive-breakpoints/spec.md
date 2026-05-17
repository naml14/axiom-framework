# Responsive Breakpoints Specification

## Purpose

Defines Axiom's responsive breakpoint system, which operates as a container-query model rather than a traditional viewport-based media query model. This spec covers breakpoint resolution rules, inheritance, and fallback behaviors for relative units.

## Requirements

### Requirement: Container-Query Resolution

The system MUST resolve breakpoints against the parent container's available width (`maxWidth`), not the absolute viewport width.

#### Scenario: Breakpoints apply based on container width, not viewport

- GIVEN a layout block with `at: { md: { flex: 'row' } }`
- WHEN the component is rendered inside a parent container narrower than the `md` breakpoint
- THEN the `md` properties MUST NOT apply, even if the overall device viewport is wider than `md`.

### Requirement: Viewport Unit Fallback

The system MUST fall back to using the container size for `vw` and `vh` units when explicit viewport dimensions are not provided to the renderer.

#### Scenario: `vw` resolution without explicit viewportWidth

- GIVEN a layout definition using `vw` units
- WHEN `viewportWidth` is not explicitly passed to the renderer
- THEN the system MUST resolve `vw` relative to the current container's width, effectively treating `vw` as a container-query unit.

### Requirement: Additive Cascade

The system MUST apply layout properties additively across multiple breakpoints, resolving conflicting properties by giving precedence to the most specific (largest matching) breakpoint.

#### Scenario: Conflicting breakpoints resolution

- GIVEN a block with `at: { md: { flex: 'row' }, lg: { flex: 'column' } }`
- WHEN the container width is large enough to satisfy both `md` and `lg` breakpoints
- THEN the system MUST apply the `flex: 'column'` property from `lg` over the `flex: 'row'` property from `md`
- AND the system MUST merge any non-conflicting properties from both breakpoints additively.
