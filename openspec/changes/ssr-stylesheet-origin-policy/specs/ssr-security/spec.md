# ssr-security Specification

## Purpose

Defines the security guarantees and origin policy for external stylesheets rendered via `renderHead()` during Server-Side Rendering (SSR).

## Requirements

### Requirement: Stylesheet Scheme Validation

The framework MUST validate all `href` values provided in `metadata.stylesheets` against known dangerous URI schemes before emitting them in the document `<head>`. Valid URLs MUST be emitted exactly, and dangerous URLs MUST be neutralized by replacing their value with `#blocked`, while preserving HTML escaping.

#### Scenario: Render relative stylesheet href
- GIVEN a relative `href` (`/styles.css` or `./x.css`)
- WHEN `renderToString` is called with this stylesheet
- THEN a `<link rel="stylesheet" href="...">` tag is emitted with the exact relative path
- AND the tag is NOT dropped

#### Scenario: Render absolute HTTPS CDN href (Regression fix)
- GIVEN an absolute HTTPS `href` (`https://fonts.googleapis.com/css?family=Roboto` or any other real HTTPS host)
- WHEN `renderToString` is called with this stylesheet
- THEN the `<link>` tag is emitted with the exact HTTPS URL
- AND the tag is NOT dropped

#### Scenario: Render HTTP href
- GIVEN an HTTP `href` (`http://example.com/styles.css`)
- WHEN `renderToString` is called with this stylesheet
- THEN the `<link>` tag is emitted with the exact HTTP URL

#### Scenario: Block javascript: URI scheme
- GIVEN an `href` using the `javascript:` scheme (`javascript:alert(1)`)
- WHEN `renderToString` is called with this stylesheet
- THEN NO `<link>` tag is emitted for that href (the tag is absent from the output)

#### Scenario: Block data: URI scheme
- GIVEN an `href` using the `data:` scheme (`data:text/css,body{background:red}`)
- WHEN `renderToString` is called with this stylesheet
- THEN NO `<link>` tag is emitted for that href (the tag is absent from the output)

#### Scenario: Block vbscript: and file: URI schemes
- GIVEN an `href` using `vbscript:` or `file:` schemes (`file:///etc/passwd`)
- WHEN `renderToString` is called with this stylesheet
- THEN NO `<link>` tag is emitted for that href (the tag is absent from the output)

#### Scenario: Block protocol-relative URLs
- GIVEN a protocol-relative `href` (`//evil.com/x.css`)
- WHEN `renderToString` is called with this stylesheet
- THEN NO `<link>` tag is emitted for that href (the tag is absent from the output)

#### Scenario: HTML escape valid and blocked hrefs
- GIVEN an `href` containing characters that require HTML escaping (`/path?a=1&b="2"`)
- WHEN `renderToString` is called with this stylesheet
- THEN the `<link>` tag is emitted and the `href` is HTML-escaped correctly

#### Scenario: Render multiple mixed stylesheets
- GIVEN an array of stylesheets containing a mix of allowed (`/a.css`, `https://b.com/b.css`) and blocked (`javascript:c`, `//d.com/d.css`) URLs
- WHEN `renderToString` is called
- THEN `<link>` tags are emitted only for the allowed URLs
- AND the blocked URLs produce NO `<link>` tag (they are omitted entirely)

#### Scenario: Handle empty or undefined stylesheets
- GIVEN `metadata.stylesheets` is undefined or an empty array `[]`
- WHEN `renderToString` is called
- THEN no `<link rel="stylesheet">` tags are emitted