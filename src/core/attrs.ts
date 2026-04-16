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
 */
const DANGEROUS_URL_SCHEME_RE = /^\s*(javascript|data|vbscript|file)\s*:/i

/**
 * Schemes that are considered safe for URLs.
 * This is used as allowlist for URL validation.
 */
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i

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
    // Allow safe schemes and relative URLs
    if (SAFE_URL_PATTERN.test(value)) {
      return value
    }
    // Block dangerous schemes
    if (hasDangerousUrlScheme(value)) {
      return '#blocked'
    }
    // Allow other values (could be relative paths without prefix)
    // Only block if it explicitly matches a dangerous scheme
    return value
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

  let hasChanges = false
  const result: Record<string, string> = {}

  for (const key of keys) {
    // Skip invalid attribute names
    if (!isValidAttrName(key)) {
      hasChanges = true
      continue
    }

    const value = attrs[key]
    if (value === undefined) continue

    const sanitized = sanitizeAttrValue(key, value)

    if (sanitized === undefined) {
      // Attribute should be removed
      hasChanges = true
      continue
    }

    if (sanitized !== value) {
      hasChanges = true
    }

    result[key] = sanitized
  }

  // Return original object if no changes were made (optimization)
  return hasChanges ? result : attrs
}
