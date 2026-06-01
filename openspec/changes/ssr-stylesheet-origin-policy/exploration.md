# Exploration: ssr-stylesheet-origin-policy

## Change slug: `ssr-stylesheet-origin-policy`
## Date: 2026-06-01
## Status: COMPLETE

---

## Current State

### `src/ssr.ts` — `renderHead()` (lines 199–205)

The REJECTED implementation **is still present in the codebase**:

```ts
if (metadata.stylesheets !== undefined) {
  const ALLOWED_STYLESHEET_ORIGIN = /^(\/|https:\/\/trusted-cdn\.com\/)/
  for (const href of metadata.stylesheets) {
    if (!ALLOWED_STYLESHEET_ORIGIN.test(href)) continue   // silently drops
    html += `<link rel="stylesheet" href="${escapeHtml(href)}">`
  }
}
```

**Problems confirmed by reading the code**:
1. `trusted-cdn.com` is a hardcoded placeholder that matches no real consumer. Every legitimate external stylesheet (Google Fonts, own CDN, etc.) is silently dropped.
2. Only relative paths starting with `/` pass through. Any `https://` URL other than `trusted-cdn.com` is dropped.
3. `href` is escaped with `escapeHtml()` (HTML attribute escaping — correct for output), but NO scheme/protocol validation is performed.
4. No tests exist covering this code path.

### `src/core/attrs.ts` — existing sanitization

The framework already ships a complete URL-scheme sanitizer for attribute values:
- `URL_SENSITIVE_ATTRS` includes `href`, `src`, `action`, `formaction`, etc.
- `sanitizeAttrValue()` blocks `javascript:`, `data:`, `vbscript:`, `file:` → rewrites to `#blocked`
- `PROTOCOL_RELATIVE_URL_RE` (`/^\s*\/\//`) blocks protocol-relative `//host` URLs → rewrites to `#blocked`
- `SAFE_URL_PATTERN` allows `https?:`, `mailto:`, `tel:`, `#`, `/`, `./`, `../`

This logic is applied via `sanitizeAttrs()` to all component attrs in `renderNode()`. **It is NOT applied to stylesheet hrefs in `renderHead()`** — an asymmetry that creates inconsistency.

### Demo / CSP

Both `demo/server.ts` and `demo/ssr-page.tsx` define:
```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

This means the browser's CSP already restricts which stylesheet origins can be loaded. Any stylesheet href not matching `'self'` or `fonts.googleapis.com` will be blocked by the browser regardless of what the framework emits. This confirms that **origin allowlisting in the framework is largely redundant when CSP is configured** — which it SHOULD be, since SECURITY_HEADERS is a first-class demo pattern.

### SECURITY.md — existing documentation

`SECURITY.md` (lines 117–133) already documents "External Stylesheet SSRF" as consumer responsibility, with a working example:
```ts
const ALLOWED = /^https:\/\/cdn\.example\.com\//;
const sheets = userSheets.filter((href) => ALLOWED.test(href));
```

This is the **correct pattern** — consumer owns the semantic allowlist, matching how `bodyStyle`, `inlineStyles`, and `metadata.og` are all handled.

---

## Threat Model

### Who controls `metadata.stylesheets`?

`SSRRenderOptions` is passed by the **consumer's server-side route handler** — it is developer-authored config, not raw user input. The primary trust boundary is at the application level: if the consumer passes user-supplied URLs directly into `metadata.stylesheets`, that is a consumer error, not a framework gap.

That said, the framework should provide a safety floor for the schemes it DOES emit.

### Actual attack vectors for `<link rel="stylesheet" href="...">`:

| Vector | Real risk? | Notes |
|--------|-----------|-------|
| `javascript:` in href | **Low** — browsers do NOT execute `javascript:` URIs as stylesheets; they may try to fetch and silently fail | Still worth blocking for defense-in-depth |
| `data:text/css,...` | **Medium** — Chrome (since ~2019) and Firefox block `data:` stylesheets from document context; Safari historically allowed it | Block for consistency with `attrs.ts` |
| `vbscript:` | **Low** — IE only, legacy concern | Block for consistency |
| Protocol-relative `//host/sheet.css` | **Low-Medium** — forces HTTP load on HTTP pages, enables network sniffing / downgrade | Block; `attrs.ts` already does this |
| `http://` on HTTPS page | **Low** — mixed-content blocked by modern browsers; also flagged by CSP | NOT blocked by current `attrs.ts`; framework should not filter this either |
| Arbitrary `https://` host | **Medium-High IF** user input flows in | Consumer responsibility; CSP `style-src` is the right enforcement layer |
| CSS data exfiltration via external sheet | **Medium** — attacker-controlled CSS can use attribute selectors to leak DOM content | Requires attacker-controlled URL; consumer must validate |

**Key insight**: The most dangerous case (arbitrary `https://` to attacker-controlled host) is NOT preventable by the framework without a consumer-configured allowlist — and the framework must NOT hardcode one. The correct delegation is CSP + consumer-level validation.

### What the framework CAN do minimally (non-breaking):

Block provably-dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative `//`) in stylesheet hrefs, consistent with how `sanitizeAttrValue` already handles `href` in component attrs. This is already documented, tested logic — it just needs to be applied in `renderHead()`.

---

## Affected Areas

| File | Why affected |
|------|-------------|
| `src/ssr.ts` — `renderHead()` | Contains the broken REJECTED implementation; needs replacement |
| `src/core/attrs.ts` | Already has the right scheme-blocking logic; `sanitizeAttrValue` or a standalone `sanitizeHref()` extract can be reused |
| `SECURITY.md` | "External Stylesheet SSRF" section (lines 117–133) is already correct; may need minor update to document scheme-blocking |
| Tests (`tests/ssr.test.ts` or similar) | New test cases for scheme-blocking behavior needed |

---

## Approaches

### Option A — Do Nothing in Framework; Document Only
Remove the placeholder regex. Rely entirely on `SECURITY.md` (already written). `href` is HTML-escaped only.
- **Pros**: Zero breaking changes; honest about framework scope
- **Cons**: `javascript:` hrefs would be emitted (even if browsers ignore them for stylesheets); inconsistency with `attrs.ts` behavior on the same `href` attribute
- **Effort**: Low
- **Verdict**: Partial — acceptable but leaves a documented inconsistency

### Option B — Configurable Allowlist via `SSRRenderOptions`
Add `allowedStylesheetOrigins?: string[] | RegExp` to `SSRRenderOptions`. When provided, acts as an allowlist (deny-by-default within that invocation). When absent, no filtering.
- **Pros**: Mirrors `allowedOrigins` pattern from CORS fix; consumer-controlled; explicit opt-in
- **Cons**: Adds API surface; does not solve the silent-drop problem from the rejected impl unless default is "allow all"; most consumers will not configure it; CSP already solves this better
- **Effort**: Medium
- **Verdict**: Overkill for current threat level. Adds complexity without proportional security gain.

### Option C — Block Only Dangerous Schemes (minimal hardening, always-on)
Replace the broken regex with scheme-blocking logic consistent with `sanitizeAttrValue`:  
Block `javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative `//`.  
Emit all other hrefs. Never silently drop a legitimate URL.
- **Pros**: Non-breaking (only removes provably-dangerous values); consistent with `attrs.ts`; testable with `bun test`; no new API surface; no false positives on real external CDN URLs
- **Cons**: Does not prevent arbitrary `https://` to attacker-controlled hosts (but that's consumer/CSP responsibility)
- **Effort**: Low
- **Verdict**: **CORRECT for a library** — same defense posture as every other href in the framework

### Option D — Delegate to CSP Guidance Only
Remove the placeholder regex. Add a note in SECURITY.md that `style-src` CSP is the recommended origin enforcement mechanism.
- **Pros**: Zero code changes; accurate; the demo already ships with CSP
- **Cons**: No scheme-blocking; inconsistency with `attrs.ts`; no in-library safety floor
- **Effort**: Low
- **Verdict**: Acceptable as a supplementary measure; insufficient alone

---

## Recommendation

### VERDICT: `necessary-but-as-documentation-only` + minimal scheme-blocking

Framework-level **origin allowlisting is NOT necessary** and should NOT be implemented as a hardcoded or default-on filter. The REJECTED implementation was wrong on all counts.

**What IS necessary**:
1. **Remove the broken placeholder regex** — it is the immediate bug.
2. **Apply scheme-blocking** (Option C) using the same logic as `sanitizeAttrValue` for `href`. This is the minimum consistency requirement: if `attrs.ts` blocks `javascript:` on component hrefs, `renderHead()` must not emit them in stylesheet links either.
3. **Preserve + improve SECURITY.md** documentation (Option D) — consumer-side origin validation and CSP guidance. The existing text is correct; consider adding the CSP angle explicitly.

**Recommended option: C + D hybrid**  
- Always block `javascript:`, `data:`, `vbscript:`, `file:`, `//` (protocol-relative) — reuse `sanitizeAttrValue` or extract a `sanitizeHref()` function from `attrs.ts`  
- Emit all legitimate `https://`, `http://`, and relative hrefs without filtering  
- Document CSP `style-src` as the correct origin enforcement mechanism  
- DO NOT implement Option B (configurable allowlist) — premature; consumer owns that concern  

**Why NOT option B right now**: The CORS allowlist (`allowedOrigins`) solves a server-side request reflection vulnerability where the framework itself is the origin reflector. Stylesheet hrefs are emitted as static HTML — the browser enforces CSP. These are different threat layers. Adding a stylesheet allowlist API would create a false sense of completeness while duplicating what CSP already does better.

---

## Risks

- **Risk 1 (Silent breakage)**: The broken regex is currently in production code. Any consumer relying on relative paths (`/styles.css`) works accidentally; any consumer with a real CDN URL (`https://fonts.googleapis.com/...`) is silently broken TODAY. Removing the regex restores the public API contract.
- **Risk 2 (Scheme-blocking false positive)**: Virtually none — no legitimate stylesheet uses `javascript:`, `data:`, or `vbscript:`. Protocol-relative `//` is a legitimate pattern on HTTP sites, but the framework already blocks it in `attrs.ts`; consistency requires blocking it here too.
- **Risk 3 (Incomplete protection theater)**: Option C alone does not prevent CSS exfiltration via attacker-controlled `https://` domains. This is intentional — it is correctly delegated to CSP + consumer validation, as documented in SECURITY.md.

---

## Ready for Proposal

**Yes.** The exploration is conclusive:
- The broken implementation must be removed immediately (no debate needed)
- Option C (scheme-blocking consistent with `attrs.ts`) + Option D (CSP/consumer docs) is the correct replacement
- No new public API is required
- Test coverage is straightforward (`bun test`-compatible): emit valid urls, block dangerous schemes, confirm no silent drops

Next recommended phase: **sdd-propose** → define the change intent + scope, then **sdd-spec** for test scenarios.
