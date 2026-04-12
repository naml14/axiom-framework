import type { ComponentDefinition, PreparedComponent, LayoutResult } from './types.js'
import type { TextLayoutEngine } from './prepare.js'

import {
  prepare,
  getNodeType,
  getTag,
  getTextContent,
  getClasses,
  getAttrs,
  getPreparedChildren,
  getNodeIndex,
} from './prepare.js'
import { reflow } from './reflow.js'

export interface SSRMetadata {
  title?: string
  description?: string
  og?: Record<string, string>
}

export interface SSRRenderOptions {
  width?: number
  height?: number
  lineHeight?: number
  font?: string
  textEngine?: TextLayoutEngine
  metadata?: SSRMetadata
  /**
   * URL inicial para SSR.
   *
   * Nota v0.2.6: el router actual depende de `window` y no es SSR-safe,
   * por lo que este valor se acepta como parte del contrato pero no se
   * integra aún al matching de rutas en servidor.
   */
  url?: string
  /** ID del elemento raíz donde se monta la app. Por defecto: `"app"`. */
  rootId?: string
}

// Elementos HTML que no tienen closing tag ni pueden tener hijos.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// Nombre de tag HTML/custom-element válido (e.g. "div", "my-component").
const VALID_TAG_RE = /^[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*$/

// Nombre de atributo HTML válido (e.g. "data-role", "aria-label").
const VALID_ATTR_RE = /^[A-Za-z_][\w:.-]*$/

function sanitizeTagName(tag: string): string {
  return VALID_TAG_RE.test(tag) ? tag : 'div'
}

export function renderToString(
  component: ComponentDefinition<void>,
  options?: SSRRenderOptions
): string {
  const prepared = prepare(component, undefined, {
    font: options?.font ?? '16px sans-serif',
    textEngine: options?.textEngine,
  })

  const layout = reflow(
    prepared,
    {
      maxWidth: options?.width ?? 800,
      maxHeight: options?.height ?? 600,
    },
    {
      lineHeight: options?.lineHeight ?? 20,
    }
  )

  const rootId = escapeHtml(options?.rootId ?? 'app')
  const bodyHtml = renderNode(prepared, layout)
  const headHtml = renderHead(options?.metadata)

  return `<!DOCTYPE html><html><head>${headHtml}</head><body><div id="${rootId}">${bodyHtml}</div></body></html>`
}

function renderNode(
  node: PreparedComponent,
  layout: LayoutResult,
  isPortalChild = false
): string {
  const nodeType = getNodeType(node)

  if (nodeType === 'text') {
    return escapeHtml(getTextContent(node) ?? '')
  }

  const children = getPreparedChildren(node)

  if (nodeType === 'fragment') {
    return children.map(child => renderNode(child, layout, isPortalChild)).join('')
  }

  if (nodeType === 'portal') {
    // Los hijos de portal son gestionados por CSS — el layout del framework no aplica.
    return children.map(child => renderNode(child, layout, true)).join('')
  }

  const tag = sanitizeTagName(getTag(node) ?? 'div')
  const attrs = getAttrs(node)
  const classes = getClasses(node)
  const idx = getNodeIndex(node)

  const attrPairs: Array<[string, string]> = []

  if (classes !== undefined && classes.length > 0) {
    attrPairs.push(['class', classes.join(' ')])
  }

  // Emitir el mismo contrato de layout que el renderer de cliente: position:absolute + transform.
  // Los portal children son CSS-managed (reflow les asigna 0×0), así que se omite el layout.
  if (!isPortalChild) {
    let style = `position:absolute;left:0px;top:0px;transform:translate(${layout.x[idx]}px,${layout.y[idx]}px);width:${layout.width[idx]}px;height:${layout.height[idx]}px;`
    if (attrs?.style) {
      style += attrs.style.endsWith(';') ? ` ${attrs.style}` : ` ${attrs.style};`
    }
    attrPairs.push(['style', style])
  } else if (attrs?.style) {
    attrPairs.push(['style', attrs.style])
  }

  if (attrs !== undefined) {
    const keys = Object.keys(attrs).sort()
    for (const key of keys) {
      if (key === 'class' || key === 'style') continue
      if (key.startsWith('on')) continue
      // Validar nombre de atributo para prevenir inyección de markup.
      if (!VALID_ATTR_RE.test(key)) continue
      attrPairs.push([key, attrs[key]!])
    }
  }

  const serializedAttrs = attrPairs
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ')

  const openTag = serializedAttrs.length > 0
    ? `<${tag} ${serializedAttrs}>`
    : `<${tag}>`

  // Los elementos void no tienen closing tag ni pueden tener hijos (HTML5).
  if (VOID_ELEMENTS.has(tag)) {
    return openTag
  }

  const inner = children.map(child => renderNode(child, layout, isPortalChild)).join('')
  return `${openTag}${inner}</${tag}>`
}

function renderHead(metadata?: SSRMetadata): string {
  if (metadata === undefined) return ''

  let html = ''

  if (metadata.title !== undefined) {
    html += `<title>${escapeHtml(metadata.title)}</title>`
  }

  if (metadata.description !== undefined) {
    html += `<meta name="description" content="${escapeHtml(metadata.description)}">`
  }

  if (metadata.og !== undefined) {
    const keys = Object.keys(metadata.og).sort()
    for (const key of keys) {
      html += `<meta property="og:${escapeHtml(key)}" content="${escapeHtml(metadata.og[key]!)}">`
    }
  }

  return html
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}