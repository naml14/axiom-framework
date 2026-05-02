# Spec: Context API Type Safety

## Purpose
Tighten the context API by preserving literal defaults and preventing type widening when providing context values.

## Requirements

1. **Preserve Literal Defaults**: The `createContext` function SHOULD preserve literal default values where appropriate using `const` generic parameters.
2. **NoInfer on Value**: The `withContext` function (or equivalent provider mechanism) MUST utilize the `NoInfer<T>` utility type (or an equivalent constraint) to prevent the provided value parameter from widening the initially declared context type.
3. **Fail on Incompatible Values**: Attempting to provide a value incompatible with the strictly inferred context type MUST fail during typecheck.

## Scenarios

### Scenario 1: Providing an incompatible context value
**Given** a context created via `createContext<string>('default')`
**When** a consumer calls `withContext(context, 123)`
**Then** the TypeScript compiler MUST produce an error because `123` is incompatible with `string`, and the context type MUST NOT be widened to `string | number`.

### Scenario 2: Preserving literal defaults
**Given** a context created via `createContext('light' as const)`
**When** examining the resulting context object
**Then** its underlying default type SHOULD be evaluated as the literal `'light'` rather than a widened `string`.