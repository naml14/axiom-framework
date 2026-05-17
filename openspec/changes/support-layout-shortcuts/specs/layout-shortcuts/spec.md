# layout-shortcuts Specification

## Purpose

Defines the supported layout shortcut properties for the flex engine, their mappings to CSS semantics, and the validation constraints applied at the syntax layer to ensure valid inputs.

## Requirements

### Requirement: Support `space-around` in JustifyContent

The system MUST distribute free space as CSS `justify-content: space-around` when `justify: 'space-around'` is provided.

#### Scenario: Flex container with space-around

- GIVEN a flex container with multiple items
- WHEN `justify: 'space-around'` is applied
- THEN items MUST be distributed evenly
- AND the gaps at the edges MUST be half the size of the gaps between items

### Requirement: Support `baseline` in AlignItems

The system MUST approximate `baseline` alignment for cross-axis children by centering them.

#### Scenario: Flex container with baseline alignment

- GIVEN a flex container with children
- WHEN `align: 'baseline'` is applied
- THEN the children MUST be aligned as if `center` was specified

### Requirement: Preserve Existing Layout Behaviors

The system MUST preserve existing behaviors without regression for `start`, `center`, `end`, `stretch`, and `space-between`.

#### Scenario: Existing layout properties

- GIVEN a flex container with previously supported layout values (e.g., `start`, `stretch`)
- WHEN these layout values are processed
- THEN the layout engine MUST render them functionally identical to their previous behavior

### Requirement: Strict Validation of Layout Values

The system MUST strictly validate layout shortcut values and reject unsupported or invalid strings at the syntax layer.

#### Scenario: Invalid layout shortcut value

- GIVEN the syntax layer processing layout shortcuts
- WHEN an invalid string value is provided (e.g., `'start-start'`)
- THEN the system MUST reject the value with a type error
- AND the system MUST NOT silently ignore the invalid value
