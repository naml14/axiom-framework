# Text Measurement Specification

## Purpose

Standardize text measurement and bounding box calculation across all layout engines to ensure visual consistency and correct rendering dimensions.

## Requirements

### Requirement: Shared Measurement Constants

The system MUST use `charWidth=8` and `wordWrapFactor=1.4` for all text measurement calculations across all layout engines.

#### Scenario: Text with word-wrap

- GIVEN a text node that wraps
- WHEN its dimensions are calculated
- THEN it MUST apply the `1.4×` word wrap factor
- AND the resulting height MUST match the expected previous flex/grid behavior.

### Requirement: Pure Shared Helper

The system MUST use a single, shared measurement helper that is pure, deterministic, and side-effect free.

#### Scenario: Shared helper execution

- GIVEN a request to measure text from any layout engine
- WHEN the shared `measureTextChild` helper is called
- THEN it MUST return consistent dimensions without modifying external state.

### Requirement: Consistent Root-level Text Heights

The system MUST calculate root-level text nodes (e.g., child of stack) with the same height as text nodes inside flex or grid containers.

#### Scenario: Text node in stack layout

- GIVEN a text node that is a child of a stack layout
- WHEN `reflow.ts:layoutText` computes its dimensions
- THEN its calculated height MUST match the height of an identical text node in a flex layout path.

#### Scenario: Text node in flex container

- GIVEN a text node inside a flex container
- WHEN `flex.ts:measureTextChild` is invoked
- THEN its calculated height MUST match the height of an identical text node in a grid layout path.

### Requirement: Backwards Compatible Layout Math

The system MUST NOT introduce regressions in existing non-text layout math, including positions and widths.

#### Scenario: Existing non-text layout

- GIVEN a standard non-text layout tree
- WHEN the unified text measurement logic is integrated
- THEN the overall positions and widths of all elements MUST remain unchanged.