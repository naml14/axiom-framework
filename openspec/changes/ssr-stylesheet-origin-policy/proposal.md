# Proposal: ssr-stylesheet-origin-policy

## Change slug: `ssr-stylesheet-origin-policy`
## Date: 2026-06-01
## Status: PROPOSED

---

## 1. Problem Statement

Currently, the `renderHead()` function in `src/ssr.ts` contains an active bug: it uses a hardcoded placeholder regex (`/^(\/|https:\/\/trusted-cdn\.com\/)/`) to filter `metadata.stylesheets`. This silently drops every legitimate external stylesheet URL (e.g., Google Fonts, custom CDNs) that isn't relative or explicitly matching the placeholder domain.

Furthermore, while the framework provides robust URL-scheme sanitization for component attributes in `src/core/attrs.ts` (blocking `javascript:`, `data:`, `vbscript:`, `file:`, and protocol-relative `//` URLs), this logic is NOT applied to stylesheet `href`s in `renderHead()`. This creates a security inconsistency where dangerous schemes might be emitted in the document `<head>`.

**Why now?**
The current implementation breaks the public `metadata.stylesheets` API contract for anyone using an external CDN. We need to fix this bug immediately while ensuring the framework maintains a consistent security posture against provably-dangerous URI schemes.

## 2. Goals and Non-Goals

### Goals
- **Fix the bug**: Remove the hardcoded placeholder regex to restore the public API contract for `metadata.stylesheets`, allowing legitimate absolute URLs.
- **Enforce Scheme Consistency**: Apply the existing scheme-blocking logic from `attrs.ts` to stylesheet `href`s in `renderHead()`, ensuring dangerous schemes are blocked and the corresponding `<link>` tag is omitted entirely.
- **Align Documentation**: Update `SECURITY.md` to clarify that Content Security Policy (CSP) `style-src` and consumer-level validation are the recommended mechanisms for origin trust.

### Non-Goals
- **NO configurable framework allowlist**: We will NOT add an `allowedStylesheetOrigins` property or similar framework-level origin allowlist. Origin trust is explicitly delegated to CSP and the consumer.
- **NO full URL parsing overhead**: We will rely on the existing fast regex-based scheme blocking rather than introducing heavy URL parsing, keeping SSR performance high.

## 3. Scope

### In Scope
- **`src/ssr.ts`**: Update `renderHead()` to remove the broken regex and apply scheme blocking to stylesheet `href`s.
- **`src/core/attrs.ts`**: Potentially extract a reusable `sanitizeHref()` or expose the existing scheme blocking logic so `ssr.ts` can consume it without duplicating rules.
- **`SECURITY.md`**: Update the "External Stylesheet SSRF" section to explicitly recommend CSP `style-src` as the primary defense layer.
- **`tests/ssr.test.ts`** (or equivalent): Add test cases verifying that real CDN and relative `href`s render correctly, while dangerous schemes are blocked.

### Out of Scope
- Adding new configuration options to `SSRRenderOptions`.
- Changing how other metadata fields (e.g., `scripts`, `links`) are handled, unless directly tied to the extracted scheme-blocking logic.
- Implementing CSP generation within the framework itself.

## 4. High-Level Approach

1. **Extract/Reuse Scheme Blocker**: In `src/core/attrs.ts`, ensure the logic that blocks `javascript:`, `data:`, `vbscript:`, `file:`, and protocol-relative `//` is accessible (e.g., as a `sanitizeHref` utility).
2. **Fix `renderHead()`**: Remove the `ALLOWED_STYLESHEET_ORIGIN` regex in `src/ssr.ts`. Iterate over `metadata.stylesheets` and pass each `href` through the scheme blocker before emitting the `<link rel="stylesheet">` tag. If blocked, omit the tag entirely (do not emit `#blocked` or any placeholder).
3. **Documentation Update**: Amend `SECURITY.md` to name CSP `style-src` as the recommended origin-enforcement layer, while retaining the existing guidance on consumer-side validation of user-provided URLs.
4. **Testing**: Write tests using `bun test` to assert the behavior of `renderHead` with various valid and invalid stylesheet URLs.

## 5. Risks and Mitigations

- **Risk: Breaking changes to consumers.**
  - **Mitigation**: The current behavior is already broken (silently dropping valid CDNs). This change fixes the break. By explicitly blocking only provably-dangerous schemes (which are never valid for stylesheets), the false positive rate is ~0.
- **Risk: Incomplete protection theater.**
  - **Mitigation**: We explicitly document in `SECURITY.md` that scheme-blocking does NOT prevent CSS exfiltration to attacker-controlled `https://` domains. We clearly delegate origin validation to the consumer and CSP, setting accurate security expectations.

## 6. Success Criteria

1. Real CDN URLs (e.g., `https://fonts.googleapis.com/...`) and relative URLs correctly render in the SSR output without being dropped.
2. Dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `//`) are blocked and the corresponding `<link>` tag is omitted from the output (no `#blocked` placeholder is emitted).
3. `SECURITY.md` is updated to reflect the framework's stance on CSP and origin trust for stylesheets.
4. All `bun test` suites pass, including new cases for the `renderHead` stylesheet behavior.
