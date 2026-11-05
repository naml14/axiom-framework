// ============================================================
// demo/streaming-route.ts — /ssr-stream route handler
//
// Sirve directamente el ReadableStream del core, que serializa el documento
// progresivamente según la demanda del lector, sin buffers ni delays locales.
// ============================================================

/// <reference types="../src/jsx.d.ts" />

import { renderToReadableStream } from '../src/index.ts'
import type { SSRMetadata } from '../src/index.ts'
import { StreamingDemoPage } from './streaming-page.js'

// ---------------------------------------------------------------------------
// Security headers — kept in sync with server.ts / ssr-page.ts
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
}

const STREAMING_CSS = `
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#090b13; color:#eef0f7; font-family:system-ui,sans-serif; padding:24px 16px 48px; }
#ssr-stream-root { position:static !important; height:auto !important; padding:24px 16px 48px; }
.ssr-stream-shell {
  position:static !important;
  transform:none !important;
  width:auto !important;
  height:auto !important;
  max-width:760px;
  /* SSR inyecta margin:0;padding:0 inline en el atributo style; sin !important
     el motor gana a cualquier regla de la hoja. Esta capa debe declarar el
     espaciado real y el centrado de la card. */
  margin:0 auto !important;
  display:flex;
  flex-direction:column;
  gap:12px;
  padding:24px !important;
  background:#141827;
  border:1px solid #2a395a;
  border-radius:14px;
  color:#eef0f7;
  box-shadow:0 16px 40px rgba(0,0,0,.35);
}
.ssr-stream-shell * {
  position:static !important;
  transform:none !important;
  width:auto !important;
  height:auto !important;
  display:revert;
}
.ssr-stream-shell code { display:inline !important; font-family:ui-monospace,Menlo,monospace; }
.ssr-stream-shell h1 {
  font-size:28px;
  font-weight:800;
  color:#5ea3f7;
  margin-bottom:12px;
  letter-spacing:-0.03em;
}
.ssr-stream-shell p {
  font-size:17px;
  line-height:1.65;
  color:#97a1c4 !important;
  margin-bottom:8px;
}
.ssr-stream-shell strong { color:#eef0f7; }
.ssr-stream-shell .ssr-stream-muted { color:#95a0bf !important; font-size:14px; }
.ssr-stream-shell .ssr-stream-chip {
  display:inline-block;
  padding:2px 8px !important;
  margin-left:8px !important;
  border-radius:999px;
  border:1px solid rgba(94,163,247,.35);
  background:rgba(94,163,247,.12);
  color:#a9ccfb;
  font-size:12px;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.ssr-stream-shell a, .ssr-stream-shell a:visited {
  color:#26c7d9 !important;
  font-weight:700;
  text-decoration:none;
}
.ssr-stream-shell hr {
  border:0;
  border-top:1px solid #2a395a;
  margin:16px 0 !important;
}
`

/** Serve the core's progressive HTML stream with the demo shell's inline CSS. */
export async function renderStreamingSSRPage(url: URL): Promise<Response> {
  const metadata: SSRMetadata = {
    title: 'Axiom Streaming SSR Demo',
    description: 'Demo de renderToReadableStream con serialización progresiva del core.',
    inlineStyles: STREAMING_CSS,
  }

  const stream = renderToReadableStream(StreamingDemoPage, {
    width: 800,
    height: 600,
    url: `${url.pathname}${url.search}`,
    rootId: 'ssr-stream-root',
    metadata,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      ...SECURITY_HEADERS,
    },
  })
}
