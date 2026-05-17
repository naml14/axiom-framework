# component Specification

## Purpose

Defines how components are initialized, uniquely identified, and how their display names are deterministically derived from source text or options.

## Requirements

### Requirement: Deterministic Anonymous Naming

The system MUST assign a deterministic, human-readable name to components created without an explicit name. The name MUST be generated using an FNV-1a hash of the component function's source code (`fn.toString()`), formatted as `Component#{8-character-hex}`.

#### Scenario: Anonymous component definition

- GIVEN a component is defined using an anonymous function
- AND no explicit name is provided in the arguments
- WHEN the component is initialized
- THEN its display name MUST follow the format `Component#{hash}`

#### Scenario: SSR and Client consistency

- GIVEN the same anonymous component is rendered on the server (SSR) and hydrated on the client
- WHEN the components are initialized in both environments
- THEN the generated display name MUST be exactly the same

#### Scenario: Identical anonymous functions (Minifier Risk)

- GIVEN two anonymous component functions evaluate to the exact same source code (e.g., due to aggressive minification)
- WHEN they are initialized
- THEN they MUST receive the identical display name
- AND this behavior MUST be documented as a limitation of minifier variance

### Requirement: Explicit Name Override

The system MUST prioritize explicit naming over automatic hash-based naming when an explicit name is provided.

#### Scenario: Name provided in ComponentOptions

- GIVEN a component is defined with an options object containing a `name` property (`defineComponent(fn, { name: 'MyComponent' })`)
- WHEN the component is initialized
- THEN its display name MUST be exactly 'MyComponent'
- AND the hashing logic MUST be skipped

#### Scenario: Legacy name argument

- GIVEN a component is defined using the explicit name overload signature (`defineComponent('LegacyComponent', fn)`)
- WHEN the component is initialized
- THEN its display name MUST be exactly 'LegacyComponent'
- AND the hashing logic MUST be skipped

## Limitations and Guidance

### Minifier Collision

When a bundler or minifier rewrites component function bodies to identical source text (e.g. multiple `() => null` bodies after dead-code elimination), the resulting `fn.toString()` values are identical and therefore the FNV-1a hash — and display name — will collide.

**Guidance**: In any environment where two distinct components may produce identical `fn.toString()` output, assign an explicit name using either:
- `defineComponent(fn, { name: 'MyComponent' })`
- `defineComponent('MyComponent', fn)`

This is not a bug; it is an expected consequence of hash-based naming. Determinism is preserved — the names are stable and reproducible — but uniqueness across minified components is not guaranteed.
