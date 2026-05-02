# Spec: Syntax `h()` Strict Typing

## Purpose
Enhance the type safety of the hyperscript function `h()` by properly preserving component prop generic types and preventing the assignment of unknown properties.

## Requirements

1. **Preserve Generics**: The functional-component overload of `h()` MUST preserve the props generic `P` of the target component.
2. **Reject Unknown Props**: Passing extraneous or unknown properties to `h(Component, props)` MUST result in a compile-time type error.
3. **Consumer Friendly Inference**: Type inference for `h()` MUST remain ergonomic for typical usage, requiring no explicit `<P>` generic parameter from the consumer.

## Scenarios

### Scenario 1: Creating a functional component with strict props
**Given** a component `MyComponent` that accepts exactly `{ id: string }`
**When** the consumer calls `h(MyComponent, { id: 'test' })`
**Then** the function MUST correctly infer the prop types and compile successfully without requiring an explicit generic declaration.

### Scenario 2: Passing unknown properties
**Given** the same `MyComponent` accepting only `{ id: string }`
**When** the consumer calls `h(MyComponent, { id: 'test', extra: true })`
**Then** the TypeScript compiler MUST emit an error indicating that `extra` is not a known property.