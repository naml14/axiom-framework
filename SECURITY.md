# Security Policy

## Supported Versions

| Version | Supported      | Notes                                 |
|---------|----------------|---------------------------------------|
| 1.x     | ✅ Yes         | CSR + SSR, full security support      |
| 0.2.x   | ⚠️ Limited     | CSR only, critical fixes only         |
| < 0.2   | ❌ No          | End of life                           |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, report it privately using one of these methods:

1. **GitHub Private Vulnerability Reporting** (preferred):  
   Go to [Security → Report a vulnerability](https://github.com/naml14/axiom-framework/security/advisories/new)

2. **Email**:  
   Send details to the maintainer via the email listed on the [GitHub profile](https://github.com/naml14).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

### Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 7 days
- **Fix + disclosure**: coordinated with the reporter

## Scope

Axiom runs in **two environments** as of v1.0.0:

| Environment | Runtime | Since |
| ----------- | ---------------- | ------ |
| CSR (Client-Side Rendering) | Browser | v0.1.0 |
| SSR (Server-Side Rendering) | Node.js, Bun | v1.0.0 |

Each environment has distinct attack surfaces documented below:

- [CSR Threats (Browser)](#csr-threats-browser)
- [SSR Threats (Server)](#ssr-threats-server)
- [Plugin Lifecycle Risks](#plugin-lifecycle-risks)

## CSR Threats (Browser)

### Prototype Pollution via Props

**Framework protection**: `isSafeKey()` blocks keys `__proto__`, `constructor`, and `prototype` on all component prop objects before they are applied to the DOM.

**Consumer responsibility**: None — the framework handles this transparently.

### XSS via Attributes

**Framework protection**: Multiple layers of defense implemented in `src/core/attrs.ts` and applied consistently in CSR (`commitFull` / `createDOMElement`), SSR (`renderToString`), and hydration (`commitHydrate`):

1. **Attribute name validation**: `VALID_ATTR_NAME_RE` validates all attribute names match `/^[A-Za-z_][\w:.-]*$/`. Invalid names are silently dropped.
2. **Event attribute blocking**: Inline event handlers (`onclick`, `onerror`, `onload`, etc.) in the `attrs` object are automatically removed. Use `on: { click: fn }` instead.
3. **Dangerous URL scheme blocking**: For URL-sensitive attributes (`href`, `src`, `action`, `formaction`, `poster`, `data`, `cite`, `background`), dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`) are neutralized to `#blocked`.
4. **Value escaping**: In SSR, `escapeHtml()` escapes all attribute values.

**Consumer responsibility**: While the framework blocks known dangerous patterns, always sanitize user input before using it in attributes:

```ts
// ✅ Framework automatically blocks these:
createApp({ tag: 'a', attrs: { href: 'javascript:alert(1)' } }); // → href="#blocked"
createApp({ tag: 'button', attrs: { onclick: 'evil()' } });      // → onclick removed

// ⚠️ Still validate semantic URLs for your application logic:
const userUrl = getUserInput();
const isAllowedDomain = /^https:\/\/(example\.com|trusted\.org)/.test(userUrl);
```

### Event Handler Misuse

**Framework protection**:

- **Inline event attributes blocked**: Attributes like `onclick="..."`, `onerror="..."` in the `attrs` object are automatically removed (see XSS via Attributes above).
- **Event listeners via `on` are safe**: The `on: { click: fn }` API accepts only function references, not strings, so code injection via `eval` is not possible at the framework level.

**Consumer responsibility**: Never pass `eval`, `Function()`, or dynamic code execution inside your event handler functions:

```ts
// ❌ Vulnerable — dynamic code execution in handler body
createApp({ tag: 'button', on: { click: () => eval(userCode) } });

// ✅ Safe — handler is a static function reference
createApp({ tag: 'button', on: { click: () => handleClick() } });
```

## SSR Threats (Server)

### Inline Styles Injection

`SSRRenderOptions.metadata.inlineStyles` is rendered as-is inside a `<style>` block. Axiom calls `escapeStyleText()` to prevent premature `</style>` tag injection, but does **not** sanitize CSS property values.

**Risk**: An attacker controlling `inlineStyles` content can inject CSS `url()` expressions to exfiltrate data.

**Consumer responsibility**: Sanitize all CSS before passing it to `renderToString`:

```ts
// ❌ Vulnerable — CSS from untrusted source
await renderToString(app, { metadata: { inlineStyles: userCss } });

// ✅ Safe — sanitize first (example using a CSS sanitizer library)
const safeCss = sanitizeCss(userCss); // strip url(), @import, etc.
await renderToString(app, { metadata: { inlineStyles: safeCss } });
```

### External Stylesheet SSRF

`SSRRenderOptions.metadata.stylesheets` (`string[]`) are emitted as `<link rel="stylesheet">` href attributes. Axiom escapes the value but does **not** validate the protocol or hostname.

**Risk**: A server-side request or redirect to an attacker-controlled URL (SSRF / open redirect).

**Consumer responsibility**: Validate that all stylesheet hrefs use allowed protocols and trusted hosts:

```ts
// ❌ Vulnerable
const sheets = [req.query.css];

// ✅ Safe
const ALLOWED = /^https:\/\/cdn\.example\.com\//;
const sheets = userSheets.filter((href) => ALLOWED.test(href));
await renderToString(app, { metadata: { stylesheets: sheets } });
```

### Metadata Key Injection

`metadata.og` keys are rendered as `<meta property="og:KEY">` attributes. Do not map untrusted input objects directly to `metadata.og`.

**Consumer responsibility**: Allowlist the keys you emit:

```ts
// ❌ Vulnerable — untrusted keys become meta tags
await renderToString(app, { metadata: { og: untrustedObject } });

// ✅ Safe — explicit allowlist
const { title, description } = untrustedObject;
await renderToString(app, { metadata: { og: { title, description } } });
```

See also [Plugin Lifecycle Risks](#plugin-lifecycle-risks) for additional SSR concerns.

## Plugin Lifecycle Risks

### Cross-Request Pollution

The plugin registry (`_registry`) is a **module-level singleton**. On long-running Bun/Node servers, plugins registered at startup persist for the entire process lifetime and receive lifecycle callbacks for **every** app instance across **all** requests.

**Risk**: A plugin that accumulates request-scoped state will leak data between requests.

**Consumer recommendations**:

1. Register plugins once at server startup, not per-request.
2. Keep plugin `onMount`/`onUnmount` hooks **stateless**.
3. For strict request isolation, run each request in a separate Worker with its own module scope.

### Supply Chain Risk

Plugin hooks (`onMount`, `onUnmount`, `onUpdate`) run with the **full permissions of the server process** — file system, network, environment variables, and child processes.

**Consumer recommendations**:

1. Vet every third-party plugin before installing it.
2. Audit plugin source code and watch for suspicious hooks.
3. Pin plugin versions and review changelogs before upgrading.
4. Sandbox untrusted plugins in a restricted Worker or subprocess.

## Out of Scope

The following are **not covered** by this security policy:

1. **Application-level semantic validation** — The framework sanitizes base XSS vectors (attribute name validation, `on*` blocking, dangerous URL scheme neutralization in CSR/SSR/hydration, and HTML escaping). Consumers still own semantic/business validation such as trusted URL hosts, CSS allowlists for `metadata.inlineStyles`, and allowlisted metadata keys.
2. **Third-party plugin security** — Plugins run with full process permissions; vetting them is the consumer's responsibility.
3. **Theoretical vulnerabilities** — Reports must include a working proof of concept.
4. **Physical access** — Vulnerabilities that require physical access to the user's or server's machine.

## API Stability and Security

The security review coverage of a given API depends on its stability tier:

| API Type | Security Posture |
| -------------- | --------------------------------------------------------------- |
| **Stable** | Fully reviewed; breaking changes require a major version bump |
| **Experimental** | May have undiscovered security gaps; not recommended for production security-sensitive code |

**Recommendation**: Use only stable APIs (`createApp`, `renderToString`, `createPlugin`, `createRouter`) in production environments where security is a concern. Experimental APIs may be promoted or removed between minor versions.
