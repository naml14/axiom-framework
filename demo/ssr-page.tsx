/**
 * SSR page handler for the Axiom demo server.
 *
 * Uses JSX syntax to build the component tree, demonstrating that
 * Axiom's JSX runtime (`jsx-runtime`) produces the same ComponentNode
 * tree as the imperative `h()` API — zero runtime difference.
 */

/// <reference types="../src/jsx.d.ts" />

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lazy-loaded SSR module (compiled src) kept as a module-level singleton. */
type SSRModule = typeof import('../src/index.ts')

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
  'body { background:#080814; color:#e5e7eb; }',
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
  '.ssr-shell h1, .ssr-shell p, .ssr-shell code, .ssr-shell hr, .ssr-shell a, .ssr-shell strong, .ssr-shell span {',
  '  position:static !important;',
  '  transform:none !important;',
  '}',
  '.ssr-shell h1 {',
  '  line-height:1.15;',
  '  letter-spacing:-0.03em;',
  '  margin-bottom:4px;',
  '}',
  '.ssr-lead {',
  '  font-size:17px;',
  '  line-height:1.65;',
  '  color:#cbd5e1 !important;',
  '}',
  '.ssr-muted {',
  '  color:#94a3b8 !important;',
  '  font-size:14px;',
  '  line-height:1.55;',
  '}',
  '.ssr-strong {',
  '  color:#f8fafc !important;',
  '  font-weight:800;',
  '}',
  '.ssr-code {',
  '  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
  '  font-size:14px;',
  '  line-height:1.6;',
  '  overflow-wrap:anywhere;',
  '}',
  '.ssr-stack {',
  '  display:flex !important;',
  '  flex-direction:column !important;',
  '  gap:8px;',
  '}',
  '.ssr-chip {',
  '  display:inline-block !important;',
  '  padding:2px 8px;',
  '  margin-left:8px;',
  '  border-radius:999px;',
  '  border:1px solid rgba(167,139,250,.35);',
  '  background:rgba(167,139,250,.12);',
  '  color:#c4b5fd !important;',
  '  font-size:12px;',
  '  font-weight:700;',
  '  letter-spacing:.04em;',
  '  text-transform:uppercase;',
  '}',
  '.ssr-shell a, .ssr-shell a:visited {',
  '  color:#7dd3fc !important;',
  '  text-decoration:none !important;',
  '}',
  '.ssr-shell a:hover {',
  '  color:#bae6fd !important;',
  '}',
  '.ssr-link-inline, .ssr-link-inline:visited {',
  '  color:#c4b5fd !important;',
  '  border-bottom:1px dashed rgba(196,181,253,.7);',
  '  overflow-wrap:anywhere;',
  '}',
  '.ssr-link-back, .ssr-link-back:visited {',
  '  display:inline-flex !important;',
  '  align-items:center;',
  '  gap:8px;',
  '  color:#5eead4 !important;',
  '  font-weight:800;',
  '}',
].join('\n')

// ---------------------------------------------------------------------------
// JSX component tree
// ---------------------------------------------------------------------------

function buildSSRDemoTree(params: {
  route: string
  name: string
  width: number
  rootId: string
  queryString: string
}) {
  const { route, name, width, rootId, queryString } = params

  return (
    <main
      class="ssr-shell card"
      attrs={{
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
      }}
      flex="column"
      gap={12}
      padding={20}
    >
      {/* Title */}
      <h1 class="ssr-title" attrs={{ style: 'font-size:28px;font-weight:800;color:#a78bfa;' }}>
        SSR Demo — Axiom renderToString()
        <span class="ssr-chip">server rendered</span>
      </h1>

      {/* Greeting */}
      <p class="ssr-lead" attrs={{ style: 'color:#b2b2d0;' }}>
        Hola <strong class="ssr-strong">{name}</strong>, esta página fue renderizada en servidor con
        {' '}<strong class="ssr-strong">renderToString()</strong>.
      </p>

      {/* Current URL echo */}
      <code
        class="ssr-code"
        attrs={{
          style: 'display:block;padding:10px 12px;background:#0a0a14;'
              + 'border:1px solid #2a2a4a;border-radius:8px;color:#5eead4;',
        }}
      >
        GET {route}{queryString}
      </code>

      {/* Stats + tip */}
      <div class="ssr-stack" flex="column" gap={6}>
        <p class="ssr-muted" attrs={{ style: 'color:#9ca3af;font-size:14px;' }}>
          Ancho SSR: <strong class="ssr-strong">{width}px</strong> · rootId: <strong class="ssr-strong">{rootId}</strong>
        </p>
        <p class="ssr-muted" attrs={{ style: 'color:#9ca3af;font-size:14px;' }}>
          Tip: modifica los query params para probar distintas configuraciones SSR.
        </p>
        <p attrs={{ style: 'color:#e2e2f0;' }}>
          <strong class="ssr-strong">Ejemplo:</strong>{' '}
          <a
            class="ssr-link-inline"
            href="/ssr?name=Dev&width=720&root=ssr-root"
            attrs={{ style: 'color:#a78bfa;text-decoration:none;border-bottom:1px dashed #a78bfa;' }}
          >
            /ssr?name=Dev&width=720&root=ssr-root
          </a>
        </p>
      </div>

      {/* Divider */}
      <hr attrs={{ style: 'border:0;border-top:1px solid #2a2a4a;' }} />

      {/* Back link */}
      <a
        class="ssr-link-back"
        href="/"
        attrs={{ style: 'color:#5eead4;text-decoration:none;font-weight:700;' }}
      >
        ← Volver al demo interactivo
      </a>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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
