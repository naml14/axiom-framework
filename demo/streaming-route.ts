// ============================================================
// demo/streaming-route.ts — /ssr-stream route handler
//
// Usa renderToReadableStream() para emitir el HTML como un ReadableStream.
// Como la implementación actual emite en un solo chunk, este handler hace
// chunking artificial: parte el HTML en dos (head + body) y los emite con
// un delay para que el cliente pueda ver la diferencia entre una respuesta
// clásica y una streaming en DevTools (Network → Response → Timing).
//
// En una versión futura, renderToReadableStream() soportará async boundaries
// y emitirá múltiples chunks naturalmente.
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
body { background:#080814; color:#e5e7eb; font-family:system-ui,sans-serif; padding:24px 16px 48px; }
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
  background:#12121f;
  border:1px solid #2a2a4a;
  border-radius:14px;
  color:#e2e2f0;
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
  color:#a78bfa;
  margin-bottom:12px;
  letter-spacing:-0.03em;
}
.ssr-stream-shell p {
  font-size:17px;
  line-height:1.65;
  color:#cbd5e1 !important;
  margin-bottom:8px;
}
.ssr-stream-shell strong { color:#f8fafc; }
.ssr-stream-shell .ssr-stream-muted { color:#94a3b8 !important; font-size:14px; }
.ssr-stream-shell .ssr-stream-chip {
  display:inline-block;
  padding:2px 8px !important;
  margin-left:8px !important;
  border-radius:999px;
  border:1px solid rgba(167,139,250,.35);
  background:rgba(167,139,250,.12);
  color:#c4b5fd;
  font-size:12px;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.ssr-stream-shell a, .ssr-stream-shell a:visited {
  color:#5eead4 !important;
  font-weight:700;
  text-decoration:none;
}
.ssr-stream-shell hr {
  border:0;
  border-top:1px solid #2a2a4a;
  margin:16px 0 !important;
}
`

function injectStyleIntoHead(html: string, style: string): string {
  const headEnd = html.indexOf('</head>')
  if (headEnd === -1) return html
  return html.slice(0, headEnd) + `<style>${style}</style>` + html.slice(headEnd)
}

/**
 * Render the streaming page with artificial chunking to demonstrate the
 * ReadableStream API. The body is split at the </head> boundary and emitted
 * as two chunks with a small delay.
 *
 * renderToReadableStream() already returns a complete HTML document
 * (<!DOCTYPE html>...</html>) because it wraps renderToString(). We inject
 * extra <style> for the demo shell, then split at </head> to demonstrate
 * chunked transfer-encoding.
 */
export async function renderStreamingSSRPage(url: URL): Promise<Response> {
  const metadata: SSRMetadata = {
    title: 'Axiom Streaming SSR Demo',
    description: 'Demo de renderToReadableStream con chunking artificial.',
  }

  // 1. Generate full HTML using the framework's stream entry point
  const stream = renderToReadableStream(StreamingDemoPage, {
    width: 800,
    height: 600,
    url: `${url.pathname}${url.search}`,
    rootId: 'ssr-stream-root',
    metadata,
  })

  // 2. Read the (currently single-chunk) output into a string so we can
  //    re-emit it in multiple chunks. This is the "artificial chunking" that
  //    makes the streaming behaviour visible without modifying the core.
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let rawHtml = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    rawHtml += decoder.decode(value, { stream: true })
  }
  rawHtml += decoder.decode()

  // 3. Inject extra <style> for the demo shell (renderToReadableStream already
  //    returns a complete HTML document, so we don't wrap it).
  const fullHtml = injectStyleIntoHead(rawHtml, STREAMING_CSS)

  // 4. Split at </head> boundary so the head arrives before the body.
  const headEndIdx = fullHtml.indexOf('</head>') + '</head>'.length
  const headChunk = fullHtml.slice(0, headEndIdx)
  const bodyChunk = fullHtml.slice(headEndIdx)

  // 5. Emit as two chunks with a 100ms gap (artificial streaming)
  const encoder = new TextEncoder()
  const chunkedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(headChunk))
      await new Promise((resolve) => setTimeout(resolve, 100))
      controller.enqueue(encoder.encode(bodyChunk))
      controller.close()
    },
  })

  return new Response(chunkedStream, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      ...SECURITY_HEADERS,
    },
  })
}
