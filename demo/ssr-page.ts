/**
 * SSR page handler for the Axiom demo server.
 *
 * Exports a single function, `renderSSRPage`, which:
 *  1. Parses query params from the incoming URL.
 *  2. Builds a demo Axiom component tree.
 *  3. Calls `renderToString` from the compiled framework.
 *  4. Returns a fully-formed HTML `Response`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lazy-loaded SSR module (compiled src) kept as a module-level singleton. */
type SSRModule = typeof import('../src/index.ts')

// ---------------------------------------------------------------------------
// Node factory helpers
//
// These are ONLY used in this file to keep the component tree readable.
// They are intentionally not part of the public framework API.
// ---------------------------------------------------------------------------

import type { ElementNode, TextNode, ComponentNode } from '../src/types.js'

type ElementOptions = Omit<ElementNode, 'type' | 'tag' | 'children'>

/** Create an ElementNode with less boilerplate. */
function el(
  tag: string,
  options: ElementOptions,
  children: ComponentNode[] = [],
): ElementNode {
  return { type: 'element', tag, ...options, children }
}

/** Create a TextNode. */
function txt(content: string): TextNode {
  return { type: 'text', content }
}

// ---------------------------------------------------------------------------
// Module loading — lazy singleton so the module import happens once
// ---------------------------------------------------------------------------

const ssrModulePromise: Promise<SSRModule> = import('../src/index.ts') as Promise<SSRModule>

// ---------------------------------------------------------------------------
// Query-param parsing helpers
// ---------------------------------------------------------------------------

type SSRParams = {
  name: string
  width: number
  rootId: string
  queryString: string
}

function parseSSRParams(url: URL): SSRParams {
  const rawName = (url.searchParams.get('name') ?? 'Axiom').trim()
  const name = rawName || 'Axiom'

  const rawWidth = url.searchParams.get('width')
  const parsedWidth = Number.parseInt(rawWidth ?? '960', 10)
  const width = !Number.isFinite(parsedWidth) || Number.isNaN(parsedWidth)
    ? 960
    : Math.max(320, Math.min(1600, parsedWidth))

  const rawRoot = url.searchParams.get('root')
  const value = (rawRoot ?? 'ssr-root').trim()
  const rootId = value.length === 0 || !/^[A-Za-z_][\w-]*$/.test(value)
    ? 'ssr-root'
    : value

  const queryString =
    `?name=${encodeURIComponent(name)}` +
    `&width=${width}` +
    `&root=${encodeURIComponent(rootId)}`

  return { name, width, rootId, queryString }
}

const SSR_SHELL_CSS = (width: number, rootId: string): string => [
  '* { box-sizing:border-box; margin:0; padding:0; }',
  `#${rootId} { position:static !important; height:auto !important; padding:24px 16px 48px; }`,
  '.ssr-shell {',
  '  position:static !important;',
  '  transform:none !important;',
  '  width:auto !important;',
  '  height:auto !important;',
  `  max-width:${width}px;`,
  '  margin:0 auto;',
  '  display:flex;',
  '  flex-direction:column;',
  '  gap:12px;',
  '  padding:24px;',
  '}',
  '.ssr-shell * {',
  '  position:static !important;',
  '  transform:none !important;',
  '  width:auto !important;',
  '  height:auto !important;',
  '  display:revert;',
  '}',
  '.ssr-shell code {',
  '  display:block !important;',
  '}',
].join('\n')

// ---------------------------------------------------------------------------
// Component definition
// ---------------------------------------------------------------------------

/**
 * Build the SSR demo component tree.
 *
 * Accepts the resolved query params so the tree stays a pure function
 * of its inputs (no hidden reads from `URL` inside the component).
 */
function buildSSRDemoTree(params: {
  route: string
  name: string
  width: number
  rootId: string
  queryString: string
}): ElementNode {
  const { route, name, width, rootId, queryString } = params

  return el('main', {
    classes: ['ssr-shell', 'card'],
    attrs: {
      style: [
        'margin:24px auto',
        `max-width:${width}px`,
        'background:#12121f',
        'border:1px solid #2a2a4a',
        'border-radius:14px',
        'color:#e2e2f0',
        'font-family:system-ui,sans-serif',
        'box-shadow:0 16px 40px rgba(0,0,0,.35)',
      ].join(';') + ';',
    },
    layout: { flexDirection: 'column', gap: 12, padding: 20 },
  }, [
    // — Title —
    el('h1', { attrs: { style: 'font-size:28px;font-weight:800;color:#a78bfa;' } }, [
      txt('SSR Demo — Axiom renderToString()'),
    ]),

    // — Greeting —
    el('p', { attrs: { style: 'color:#b2b2d0;' } }, [
      txt(`Hola ${name}, esta página fue renderizada en servidor con renderToString().`),
    ]),

    // — Current URL echo —
    el('code', {
      attrs: {
        style: 'display:block;padding:10px 12px;background:#0a0a14;'
            + 'border:1px solid #2a2a4a;border-radius:8px;color:#5eead4;',
      },
    }, [
      txt(`GET ${route}${queryString}`),
    ]),

    // — Stats + tip —
    el('div', { layout: { flexDirection: 'column', gap: 6 } }, [
      el('p', { attrs: { style: 'color:#9ca3af;font-size:14px;' } }, [
        txt(`Ancho SSR: ${width}px · rootId: ${rootId}`),
      ]),
      el('p', { attrs: { style: 'color:#9ca3af;font-size:14px;' } }, [
        txt('Tip: modifica los query params para probar distintas configuraciones SSR.'),
      ]),
      el('p', { attrs: { style: 'color:#e2e2f0;' } }, [
        txt('Ejemplo: '),
        el('a', {
          attrs: {
            href: '/ssr?name=Dev&width=720&root=ssr-root',
            style: 'color:#a78bfa;text-decoration:none;border-bottom:1px dashed #a78bfa;',
          },
        }, [
          txt('/ssr?name=Dev&width=720&root=ssr-root'),
        ]),
      ]),
    ]),

    // — Divider —
    el('hr', { attrs: { style: 'border:0;border-top:1px solid #2a2a4a;' } }),

    // — Back link —
    el('a', {
      attrs: {
        href: '/',
        style: 'color:#5eead4;text-decoration:none;font-weight:700;',
      },
    }, [
      txt('← Volver al demo interactivo'),
    ]),
  ])
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle `GET /ssr` requests.
 *
 * Reads `name`, `width`, and `root` query params, renders the demo component
 * to HTML via `renderToString`, and returns the resulting `Response`.
 */
export async function renderSSRPage(url: URL): Promise<Response> {
  const { defineComponent, renderToString } = await ssrModulePromise

  const { name, width, rootId, queryString: qs } = parseSSRParams(url)

  const SSRDemoApp = defineComponent(() =>
    buildSSRDemoTree({
      route: url.pathname,
      name,
      width,
      rootId,
      queryString: qs,
    }),
  )

  const html = await renderToString(SSRDemoApp, {
    width,
    height: 720,
    url: `${url.pathname}${url.search}`,
    rootId,
    metadata: {
      title: 'Axiom SSR Demo',
      description: 'Demo SSR con renderToString, rootId configurable y layout consistente con cliente.',
      og: { type: 'website' },
      stylesheets: ['/style.css'],
      inlineStyles: SSR_SHELL_CSS(width, rootId),
    },
  })

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
