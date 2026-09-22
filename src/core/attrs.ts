/**
 * Attribute Sanitization Module
 *
 * Provides security hardening for HTML attributes in both CSR and SSR paths.
 * Implements defense-in-depth against XSS vectors through attribute validation.
 *
 * @module core/attrs
 * @since 1.0.0
 */

// ============================================================
// Blocklists and Patterns
// ============================================================

/**
 * Event attributes that execute JavaScript when triggered.
 * These are blocked because inline event handlers are an XSS vector.
 *
 * Note: Axiom uses `on: { click: fn }` for event binding, not inline attrs.
 * Any `onclick`, `onerror`, etc. in attrs is likely an injection attempt.
 */
export const DANGEROUS_EVENT_ATTRS = new Set([
  // Mouse events
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'onwheel',
  'oncontextmenu',
  // Keyboard events
  'onkeydown',
  'onkeyup',
  'onkeypress',
  // Focus events
  'onfocus',
  'onblur',
  'onfocusin',
  'onfocusout',
  // Form events
  'onsubmit',
  'onreset',
  'onchange',
  'oninput',
  'oninvalid',
  'onselect',
  // Window/Document events
  'onload',
  'onerror',
  'onabort',
  'onbeforeunload',
  'onunload',
  'onhashchange',
  'onpageshow',
  'onpagehide',
  'onpopstate',
  'onresize',
  'onscroll',
  'onstorage',
  'onoffline',
  'ononline',
  // Clipboard events
  'oncopy',
  'oncut',
  'onpaste',
  // Drag events
  'ondrag',
  'ondragstart',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  // Media events
  'onplay',
  'onpause',
  'onplaying',
  'onprogress',
  'onratechange',
  'onseeked',
  'onseeking',
  'onstalled',
  'onsuspend',
  'ontimeupdate',
  'onvolumechange',
  'onwaiting',
  'oncanplay',
  'oncanplaythrough',
  'ondurationchange',
  'onemptied',
  'onended',
  'onloadeddata',
  'onloadedmetadata',
  'onloadstart',
  // Animation events
  'onanimationstart',
  'onanimationend',
  'onanimationiteration',
  'ontransitionend',
  'ontransitionstart',
  'ontransitioncancel',
  'ontransitionrun',
  // Touch events
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  // Pointer events
  'onpointerdown',
  'onpointerup',
  'onpointermove',
  'onpointerenter',
  'onpointerleave',
  'onpointerover',
  'onpointerout',
  'onpointercancel',
  'ongotpointercapture',
  'onlostpointercapture',
  // Other
  'onmessage',
  'onmessageerror',
  'onbeforeprint',
  'onafterprint',
  'onbeforeinput',
  'onformdata',
  'onsecuritypolicyviolation',
  'onslotchange',
  'ontoggle',
])

/**
 * Attributes that contain URLs and must be validated for dangerous schemes.
 */
export const URL_SENSITIVE_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'data',
  'cite',
  'background',
  'codebase',
  'dynsrc',
  'lowsrc',
  'usemap',
  'longdesc',
  'profile',
  'manifest',
  'icon',
  'srcset', // Needs special handling but including for completeness
])

/**
 * URL schemes that can execute JavaScript or access local resources.
 * Case-insensitive matching is required.
 *
 * NOTE: `data:` appears here but `data:image/*`, `data:audio/*`, `data:video/*`
 * are handled separately in `SAFE_DATA_URL_RE` and PASS sanitization. The catch-all
 * `data:` block here covers `data:text/html`, `data:application/javascript`,
 * `data:text/css`, etc., which can execute script in modern browsers.
 */
const DANGEROUS_URL_SCHEME_RE = /^\s*(javascript|data|vbscript|file)\s*:/i

/**
 * Schemes that are considered safe for URLs.
 * This is used as allowlist for URL validation.
 */
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i
/**
 * Protocol-relative URL prefix (e.g. `//evil.com`).
 *
 * Matches any combination of two leading slashes or backslashes. Chromium-based
 * browsers normalize backslashes to forward slashes in URL attributes, so
 * `\\evil.com`, `/\evil.com`, and `\/evil.com` all resolve to protocol-relative
 * navigation and must be blocked alongside `//evil.com`.
 */
const PROTOCOL_RELATIVE_URL_RE = /^\s*[/\\][/\\]/

/**
 * Safe `data:` URL allowlist.
 *
 * Only media MIME prefixes (`image/*`, `audio/*`, `video/*`) are allowed because
 * they cannot execute JavaScript when rendered. Anything else starting with
 * `data:` is treated as dangerous — specifically `data:text/html`,
 * `data:application/javascript`, `data:text/css`, etc., which can execute script
 * or load external resources in modern browsers.
 *
 * IMPORTANT — SVG caveat: SVG files are XML and can contain `<script>` tags,
 * `onload`/`onclick` handlers, `javascript:` hrefs, and external references.
 * Inline `data:image/svg+xml,<svg>…</svg>` is therefore an XSS vector and must
 * be BLOCKED, even though the MIME prefix looks safe. Only the base64-encoded
 * form is allowed, because its content is treated as opaque image data by the
 * browser:
 *
 *   data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…  → allowed (opaque bytes)
 *   data:image/svg+xml,<svg onload=alert(1)>    → BLOCKED (inline XSS)
 *
 * Examples:
 *   data:image/png;base64,iVBORw0KGgo…               → allowed
 *   data:image/jpeg;base64,/9j/4AAQ…                  → allowed
 *   data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…       → allowed
 *   data:audio/mp3;base64,//uQxAAAA…                 → allowed
 *   data:video/mp4;base64,AAAAIGZ0eXBpc29t…           → allowed
 *   data:image/svg+xml,<svg onload="alert(1)">        → blocked
 *   data:text/html,<script>alert(1)</script>          → blocked
 *   data:text/plain;base64,…                          → blocked
 *   data:application/javascript,…                     → blocked
 */
export const SAFE_DATA_URL_RE = /^\s*data:image\/(png|jpe?g|gif|webp|bmp|ico|avif)\s*;/i
export const SAFE_AUDIO_DATA_URL_RE = /^\s*data:audio\//i
export const SAFE_VIDEO_DATA_URL_RE = /^\s*data:video\//i
// SVG is allowed ONLY with base64 encoding. The `(?=.*;base64)` lookahead
// ensures the value declares a base64 payload; inline XML is rejected.
export const SAFE_SVG_DATA_URL_RE = /^\s*data:image\/svg\+xml\s*;base64,/i

export function isSafeDataUrl(value: string): boolean {
  return (
    SAFE_DATA_URL_RE.test(value) ||
    SAFE_SVG_DATA_URL_RE.test(value) ||
    SAFE_AUDIO_DATA_URL_RE.test(value) ||
    SAFE_VIDEO_DATA_URL_RE.test(value)
  )
}

/**
 * Valid HTML attribute name pattern.
 * Matches standard HTML/XML attribute names including data-* and aria-*.
 */
export const VALID_ATTR_NAME_RE = /^[A-Za-z_][\w:.-]*$/

// ============================================================
// Sanitization Functions
// ============================================================

/**
 * Checks if an attribute name is a dangerous event handler.
 */
export function isDangerousEventAttr(key: string): boolean {
  return DANGEROUS_EVENT_ATTRS.has(key.toLowerCase())
}

/**
 * Checks if an attribute value contains a dangerous URL scheme.
 */
export function hasDangerousUrlScheme(value: string): boolean {
  return DANGEROUS_URL_SCHEME_RE.test(value)
}

/**
 * Checks if an attribute requires URL validation.
 */
export function isUrlSensitiveAttr(key: string): boolean {
  return URL_SENSITIVE_ATTRS.has(key.toLowerCase())
}

/**
 * Checks if an attribute name is valid according to HTML spec.
 */
export function isValidAttrName(key: string): boolean {
  return VALID_ATTR_NAME_RE.test(key)
}

/**
 * Validates a URL-bearing value against the project's deny-list policy and
 * returns either the original value (safe) or the `'#blocked'` sentinel
 * (dangerous). Exported so SSR paths that emit URLs outside of attribute
 * sanitization (e.g. `<link rel="stylesheet">` hrefs in renderHead) can reuse
 * the exact same policy instead of re-implementing it.
 *
 * Order matters: protocol-relative URLs are rejected first (they can smuggle a
 * dangerous origin past the scheme check), then known-safe shapes pass, then
 * any remaining dangerous scheme is blocked. Anything else is left untouched.
 */
export function sanitizeUrlValue(value: string): string {
  if (typeof value !== 'string') {
    return '#blocked'
  }
  if (PROTOCOL_RELATIVE_URL_RE.test(value)) {
    return '#blocked'
  }
  if (SAFE_URL_PATTERN.test(value)) {
    return value
  }
  // Safe data: URLs (image/audio/video) pass through before the dangerous
  // catch-all. Anything else starting with `data:` is blocked.
  if (isSafeDataUrl(value)) {
    return value
  }
  if (hasDangerousUrlScheme(value)) {
    return '#blocked'
  }
  return value
}

/**
 * Sanitizes a single attribute value based on the attribute key.
 *
 * @param key - The attribute name
 * @param value - The attribute value
 * @returns The sanitized value, or undefined if the attribute should be removed
 */
export function sanitizeAttrValue(
  key: string,
  value: string
): string | undefined {
  const lowerKey = key.toLowerCase()

  // Block event handler attributes entirely
  if (isDangerousEventAttr(lowerKey)) {
    return undefined
  }

  // Validate URL schemes for URL-sensitive attributes
  if (isUrlSensitiveAttr(lowerKey)) {
    return sanitizeUrlValue(value)
  }

  return value
}

/**
 * Sanitizes an attributes object, removing dangerous attributes and
 * neutralizing dangerous URL schemes.
 *
 * This function is the main entry point for attribute sanitization
 * in both CSR and SSR paths.
 *
 * @param attrs - The attributes object to sanitize
 * @returns A new object with sanitized attributes (does not mutate input)
 *
 * @example
 * ```ts
 * const safe = sanitizeAttrs({
 *   href: 'javascript:alert(1)',
 *   onclick: 'doEvil()',
 *   class: 'button',
 * })
 * // Result: { href: '#blocked', class: 'button' }
 * // 'onclick' is removed, 'href' is neutralized
 * ```
 */
export function sanitizeAttrs(
  attrs: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (attrs === undefined) return undefined

  const keys = Object.keys(attrs)
  if (keys.length === 0) return attrs

  // Two-pass design: the first pass detects whether any key needs changing.
  // Only allocate the result object if at least one key actually changes —
  // this avoids paying for a fresh empty object every time sanitizeAttrs is
  // called with already-clean attributes (the common case in the hot path).
  let hasChanges = false
  for (const key of keys) {
    if (!isValidAttrName(key)) {
      hasChanges = true
      break
    }
    const value = attrs[key]
    if (value === undefined) continue
    const sanitized = sanitizeAttrValue(key, value)
    if (sanitized === undefined || sanitized !== value) {
      hasChanges = true
      break
    }
  }

  if (!hasChanges) return attrs

  const result: Record<string, string> = {}
  for (const key of keys) {
    if (!isValidAttrName(key)) continue
    const value = attrs[key]
    if (value === undefined) continue
    const sanitized = sanitizeAttrValue(key, value)
    if (sanitized === undefined) continue
    result[key] = sanitized
  }

  return result
}
