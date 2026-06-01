# CORS — Security Specification

## Purpose

Define the CORS (Cross-Origin Resource Sharing) behavior for the axiom-framework server. The system MUST enforce a deny-by-default allowlist pattern for `Access-Control-Allow-Origin` reflection, eliminating the origin reflection vulnerability.

## Requirements

### Requirement: allowedOrigins Configuration

The `AxiomServerOptions` interface MUST include an optional `allowedOrigins?: string[]` property.

#### Scenario: allowedOrigins is optional

- GIVEN a server is created with `corsHeaders()`
- WHEN `allowedOrigins` is not provided
- THEN `corsHeaders()` returns an empty object `{}` (no CORS headers)

#### Scenario: allowedOrigins accepts a string array

- GIVEN a server is created with `allowedOrigins: ['https://example.com']`
- WHEN `corsHeaders()` is called
- THEN the function returns the CORS headers with the validated origin

### Requirement: Origin Validation

When `allowedOrigins` is provided, `corsHeaders()` MUST validate each origin against the allowlist using the `URL()` constructor to reject malformed origins.

#### Scenario: valid origin matches allowlist

- GIVEN `allowedOrigins: ['https://example.com']`
- WHEN `corsHeaders()` is called with `Origin: https://example.com`
- THEN the function returns `{ 'Access-Control-Allow-Origin': 'https://example.com' }`

#### Scenario: origin not in allowlist is rejected

- GIVEN `allowedOrigins: ['https://example.com']`
- WHEN `corsHeaders()` is called with `Origin: https://attacker.com`
- THEN the function returns `{}` (no CORS headers)

#### Scenario: malformed origin is rejected

- GIVEN `allowedOrigins: ['https://example.com']`
- WHEN `corsHeaders()` is called with `Origin: http://` (incomplete URL)
- THEN the function returns `{}` (no CORS headers)

#### Scenario: empty origin is rejected

- GIVEN `allowedOrigins: ['https://example.com']`
- WHEN `corsHeaders()` is called with `Origin: ''`
- THEN the function returns `{}` (no CORS headers)

### Requirement: No Wildcard Support

The system MUST NOT support wildcard origins (`*`) in `allowedOrigins`.

#### Scenario: wildcard origin is rejected

- GIVEN `allowedOrigins: ['*']`
- WHEN `corsHeaders()` is called with `Origin: https://example.com`
- THEN the function returns `{}` (wildcard is not matched)

### Requirement: Template and Demo Consistency

The CORS behavior MUST be identical across all three server implementations.

#### Scenario: template server has same behavior

- GIVEN `scripts/templates/dev-server.ts` is used
- WHEN `corsHeaders()` is called with `allowedOrigins: ['http://localhost:5173']`
- THEN the function returns `{ 'Access-Control-Allow-Origin': 'http://localhost:5173' }`

#### Scenario: demo server has same behavior

- GIVEN `demo/server.ts` is used
- WHEN `corsHeaders()` is called with `allowedOrigins: ['http://localhost:3000']`
- THEN the function returns `{ 'Access-Control-Allow-Origin': 'http://localhost:3000' }`

### Requirement: Security Documentation

`SECURITY.md` MUST document CORS as a consumer responsibility under the SSR Threats section.

#### Scenario: SECURITY.md documents CORS

- GIVEN `SECURITY.md` exists
- WHEN a reader consults the SSR Threats section
- THEN CORS configuration is documented as the consumer's responsibility to configure `allowedOrigins`

## Removed Requirements

### Requirement: Unrestricted Origin Reflection

The system's previous behavior of reflecting any `Origin` header back as `Access-Control-Allow-Origin` is removed.

(Reason: This behavior constitutes an origin reflection vulnerability — any attacker-controlled origin is echoed verbatim, allowing arbitrary cross-origin requests.)
