# SSR Metadata Security

## Purpose

Defines security requirements for SSR metadata fields that accept user-provided content. Prevents CSS injection, XSS, and SSRF through the `bodyStyle` field and other metadata inputs.

## Requirements

### Requirement: bodyStyle CSS Sanitization

The system MUST sanitize `SSRMetadata.bodyStyle` content using `escapeStyleText()` before injecting it into the `<body style="...">` attribute.

`escapeStyleText()` blocks the following CSS injection vectors:

| Pattern | Risk | Replacement |
|---------|------|-------------|
| `</style` (case-insensitive) | Premature style block termination | `<\\/style` |
| `@import` (case-insensitive) | External stylesheet loading | (empty) |
| `url(` (case-insensitive) | Data exfiltration via CSS | (empty) |
| `expression(` (case-insensitive) | Legacy IE CSS execution | (empty) |
| `behavior:` (case-insensitive) | IE HTC binding | (empty) |
| `javascript:` (case-insensitive) | JS URI in CSS properties | (empty) |

#### Scenario: bodyStyle with url() injection is sanitized

- GIVEN `bodyStyle` contains `background: url(data:text/html,<script>alert(1)</script>)`
- WHEN `renderToString()` renders the HTML
- THEN the output `<body>` tag does NOT contain `url(`
- AND the output `<body>` tag does NOT contain `<script>`

#### Scenario: bodyStyle with @import injection is sanitized

- GIVEN `bodyStyle` contains `@import url('https://evil.com/steal.css')`
- WHEN `renderToString()` renders the HTML
- THEN the output `<body>` tag does NOT contain `@import`
- AND the output `<body>` tag does NOT contain `evil.com`

#### Scenario: bodyStyle with expression() injection is sanitized

- GIVEN `bodyStyle` contains `width: expression(alert(1))`
- WHEN `renderToString()` renders the HTML
- THEN the output `<body>` tag does NOT contain `expression(`

#### Scenario: bodyStyle with javascript: URI is sanitized

- GIVEN `bodyStyle` contains `background: javascript:alert(1)`
- WHEN `renderToString()` renders the HTML
- THEN the output `<body>` tag does NOT contain `javascript:`

#### Scenario: legitimate bodyStyle content is preserved

- GIVEN `bodyStyle` contains `color: red; font-weight: bold;`
- WHEN `renderToString()` renders the HTML
- THEN the output `<body>` tag contains `color: red; font-weight: bold;`

### Requirement: SSR Metadata Documentation

The system MUST document `bodyStyle` sanitization in `SECURITY.md` and `SSR-HYDRATION-CONTRACT.md`.

#### Scenario: SECURITY.md documents bodyStyle risk

- GIVEN `SECURITY.md` is the authoritative security policy
- THEN `bodyStyle` is documented under "SSR Threats (Server)" with the same risk pattern as `inlineStyles`

#### Scenario: SSR-HYDRATION-CONTRACT.md notes bodyStyle sanitization

- GIVEN `SSR-HYDRATION-CONTRACT.md` documents `bodyStyle` behavior
- THEN it includes a note that `bodyStyle` content is CSS-sanitized before rendering

### Requirement: Test Coverage for bodyStyle Sanitization

The system MUST include test cases in `tests/ssr.test.ts` that verify CSS injection payloads are sanitized in the `bodyStyle` output.

#### Scenario: test verifies url() sanitization in bodyStyle

- GIVEN `tests/ssr.test.ts` exists
- THEN it includes a test that renders `bodyStyle` with `url(data:...)` and asserts the output does not contain `url(`

## REMOVED Requirements

### Requirement: None

No requirements are removed by this change. The `bodyStyle` field remains part of `SSRMetadata`; only its sanitization behavior changes.
