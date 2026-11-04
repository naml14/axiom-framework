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
  'body { background:#090b13; color:#eef0f7; }',
  `#${rootId} { position:static !important; height:auto !important; padding:24px 16px 48px; }`,
  '.ssr-shell {',
  '  position:static !important;',
  '  transform:none !important;',
  '  width:auto !important;',
  '  height:auto !important;',
  `  max-width:${width}px;`,
  // SSR inyecta `margin:0;padding:0` inline en el atributo style; sin `!important`
  // el motor gana a cualquier regla de la hoja. La capa que neutraliza al motor
  // (`!important` arriba) también debe declarar el espaciado real de la card.
  '  margin:24px auto !important;',
  '  display:flex;',
  '  flex-direction:column;',
  '  gap:12px;',
  '  padding:24px !important;',
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
  '  color:#97a1c4 !important;',
  '}',
  '.ssr-muted {',
  '  color:#95a0bf !important;',
  '  font-size:14px;',
  '  line-height:1.55;',
  '}',
  '.ssr-strong {',
  '  color:#eef0f7 !important;',
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
  '  padding:2px 8px !important;',
  '  margin-left:8px !important;',
  '  border-radius:999px;',
  '  border:1px solid rgba(94,163,247,.35);',
  '  background:rgba(94,163,247,.12);',
  '  color:#a9ccfb !important;',
  '  font-size:12px;',
  '  font-weight:700;',
  '  letter-spacing:.04em;',
  '  text-transform:uppercase;',
  '}',
  '.ssr-shell a, .ssr-shell a:visited {',
  '  color:#83a0db !important;',
  '  text-decoration:none !important;',
  '}',
  '.ssr-shell a:hover {',
  '  color:#b9c9ea !important;',
  '}',
  '.ssr-link-inline, .ssr-link-inline:visited {',
  '  color:#a9ccfb !important;',
  '  border-bottom:1px dashed rgba(196,181,253,.7);',
  '  overflow-wrap:anywhere;',
  '}',
  '.ssr-link-back, .ssr-link-back:visited {',
  '  display:inline-flex !important;',
  '  align-items:center;',
  '  gap:8px;',
  '  color:#26c7d9 !important;',
  '  font-weight:800;',
  '}',
].join('\n')

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Demo-appropriate CSP — kept in sync with demo/server.ts. Scripts stay
  // strict ('self' only); inline styles are allowed because this SSR page
  // is literally demonstrating renderToString()'s `inlineStyles` + style attrs.
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
}

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
          `max-width:${width}px`,
          'background:#141827',
          'border:1px solid #2a395a',
          'border-radius:14px',
          'color:#eef0f7',
          'font-family:system-ui,sans-serif',
          'box-shadow:0 16px 40px rgba(0,0,0,.35)',
        ].join(';') + ';',
      }}
      flex="column"
      gap={12}
      padding={20}
    >
      {/* Title */}
      <h1 class="ssr-title" attrs={{ style: 'font-size:28px;font-weight:800;color:#5ea3f7;' }}>
        SSR Demo — Axiom renderToString()
        <span class="ssr-chip">server rendered</span>
      </h1>

      {/* Greeting */}
      <p class="ssr-lead" attrs={{ style: 'color:#97a1c4;' }}>
        Hola <strong class="ssr-strong">{name}</strong>, esta página fue renderizada en servidor con
        {' '}<strong class="ssr-strong">renderToString()</strong>.
      </p>

      {/* Current URL echo */}
      <code
        class="ssr-code"
        attrs={{
          style: 'display:block;padding:10px 12px;background:#090b13;'
              + 'border:1px solid #2a395a;border-radius:8px;color:#26c7d9;',
        }}
      >
        GET {route}{queryString}
      </code>

      {/* Stats + tip */}
      <div class="ssr-stack" flex="column" gap={6}>
        <p class="ssr-muted" attrs={{ style: 'color:#95a0bf;font-size:14px;' }}>
          Ancho SSR: <strong class="ssr-strong">{width}px</strong> · rootId: <strong class="ssr-strong">{rootId}</strong>
        </p>
        <p class="ssr-muted" attrs={{ style: 'color:#95a0bf;font-size:14px;' }}>
          Tip: modifica los query params para probar distintas configuraciones SSR.
        </p>
        <p attrs={{ style: 'color:#eef0f7;' }}>
          <strong class="ssr-strong">Ejemplo:</strong>{' '}
          <a
            class="ssr-link-inline"
            href="/ssr?name=Dev&width=720&root=ssr-root"
            attrs={{ style: 'color:#5ea3f7;text-decoration:none;border-bottom:1px dashed #5ea3f7;' }}
          >
            /ssr?name=Dev&width=720&root=ssr-root
          </a>
        </p>
      </div>

      {/* Divider */}
      <hr attrs={{ style: 'border:0;border-top:1px solid #2a395a;' }} />

      {/* Back link */}
      <a
        class="ssr-link-back"
        href="/"
        attrs={{ style: 'color:#26c7d9;text-decoration:none;font-weight:700;' }}
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

  const html = renderToString(SSRDemoApp, {
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
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
  })
}
