# Spec: Plugin System Const Preservation

## Purpose
Improve literal type inference in the plugin system API, specifically for the `createPlugin` factory function.

## Requirements

1. **Const Preservation**: The `createPlugin` function MUST preserve literal configuration values by utilizing a `const` type parameter (e.g., `<const T>`).
2. **Literal Inference**: Calling `createPlugin({ name: 'x' })` MUST result in the `name` property being inferred as the string literal `'x'` rather than widened to the primitive `string`.

## Scenarios

### Scenario 1: Defining a plugin with a literal name
**Given** the `createPlugin` factory function
**When** a developer calls `createPlugin({ name: 'my-plugin' })`
**Then** the resulting plugin object MUST have its `name` property typed exactly as the literal `'my-plugin'`.

### Scenario 2: Using the preserved literal type
**Given** a plugin with an inferred literal name
**When** that plugin configuration is passed to the framework's internal registry or utilities
**Then** those utilities MUST be able to leverage the literal type for stricter key checking or discriminated union resolution instead of falling back to a general string map.