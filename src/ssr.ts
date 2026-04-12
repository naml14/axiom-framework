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
}

export async function renderToString(
  component: ComponentDefinition<void>,
  options?: SSRRenderOptions
): Promise<string> {
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

  const bodyHtml = renderNode(prepared, layout)
  const headHtml = renderHead(options?.metadata)

  return `<!DOCTYPE html><html><head>${headHtml}</head><body><div id="app">${bodyHtml}</div></body></html>`
}

function renderNode(node: PreparedComponent, layout: LayoutResult): string {
  const nodeType = getNodeType(node)

  if (nodeType === 'text') {
    return escapeHtml(getTextContent(node) ?? '')
  }

  const children = getPreparedChildren(node)

  if (nodeType === 'fragment' || nodeType === 'portal') {
    return children.map(child => renderNode(child, layout)).join('')
  }

  const tag = getTag(node) ?? 'div'
  const attrs = getAttrs(node)
  const classes = getClasses(node)
  const idx = getNodeIndex(node)

  const attrPairs: Array<[string, string]> = []

  if (classes !== undefined && classes.length > 0) {
    attrPairs.push(['class', classes.join(' ')])
  }

  const style = `left:${layout.x[idx]}px;top:${layout.y[idx]}px;width:${layout.width[idx]}px;height:${layout.height[idx]}px;`
  attrPairs.push(['style', style])

  if (attrs !== undefined) {
    const keys = Object.keys(attrs).sort()
    for (const key of keys) {
      if (key === 'class' || key === 'style') continue
      if (key.startsWith('on')) continue
      attrPairs.push([key, attrs[key]!])
    }
  }

  const serializedAttrs = attrPairs
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ')

  const openTag = serializedAttrs.length > 0
    ? `<${tag} ${serializedAttrs}>`
    : `<${tag}>`

  const inner = children.map(child => renderNode(child, layout)).join('')
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