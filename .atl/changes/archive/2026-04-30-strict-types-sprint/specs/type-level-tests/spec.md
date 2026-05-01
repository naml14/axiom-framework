# Spec: Type-Level Tests

## Purpose
Introduce a dedicated type-only test suite to verify the public API contracts and prevent type regressions across the framework.

## Requirements

1. **Test Suite Location**: A type-only test suite MUST exist under the `tests/types/` directory.
2. **CI Integration**: The type-level tests MUST be included in the project's `tsconfig.json` so that running `bun run typecheck` will fail if there are any type contract regressions.
3. **API Coverage**: The test suite MUST contain at least 30 assertions covering all major public APIs including: signal, computed, effect, validate, context, plugin, `h()`, JSX/runtime, and routing.
4. **Negative Testing**: Negative type assertions MUST be represented using the `@ts-expect-error` directive where appropriate.

## Scenarios

### Scenario 1: Running type checks in CI
**Given** the type-level tests are present in `tests/types/`
**When** a developer runs `bun run typecheck`
**Then** the TypeScript compiler MUST include the files in `tests/types/` in its evaluation and fail if any type assertions are violated.

### Scenario 2: Comprehensive API type coverage
**Given** the complete type-level test suite
**When** analyzing the suite's assertions
**Then** there MUST be at least 30 explicit type checks (e.g., using a utility like `expectType`) verifying correct inference across the public API surface.

### Scenario 3: Negative type assertions
**Given** an API that should reject an invalid input type (e.g., assigning a string to a number signal)
**When** writing a type test for this case
**Then** the invalid assignment MUST be prefixed with `@ts-expect-error` so that the test passes when TypeScript catches the error, but fails if the type system incorrectly allows it.