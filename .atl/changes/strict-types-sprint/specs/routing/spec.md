# Spec: Routing Type Safety

## Purpose
Tighten the type definitions for the `routing` domain to eliminate the use of `any` and improve type safety for route components.

## Requirements

1. **Eliminate Any**: The public `Route.component` property MUST NOT be typed as `any`.
2. **Safe Bound**: The `Route.component` property SHOULD use `ComponentDefinition<unknown>` or an equivalent safe, unknown-bound type.
3. **Consumer Verification**: Consumer code MUST explicitly narrow or provide compatible component definitions when defining routes to prevent assigning arbitrary unverified objects.

## Scenarios

### Scenario 1: Defining a route component
**Given** a route definition object
**When** assigning a component to the `Route.component` property
**Then** the TypeScript compiler MUST verify that the assigned component satisfies the `ComponentDefinition<unknown>` constraint (or equivalent) rather than accepting any arbitrary value.

### Scenario 2: Providing incompatible components
**Given** an invalid or loosely typed component object
**When** attempting to assign it to a route
**Then** the assignment MUST produce a type error, requiring the consumer to either provide a correct definition or explicitly narrow the component types.