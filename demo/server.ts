/**
 * Axiom demo server — entry point.
 *
 * This file is intentionally thin.  Its only responsibilities are:
 *  1. Run an initial build (unless `--no-build` is passed).
 *  2. Start file-system watching in watch mode (`--watch`).
 *  3. Start the Bun HTTP server and delegate each route.
 *
 * Logic lives in purpose-built modules:
 *  - demo/build.ts    → framework build + watch utilities
 *  - demo/ssr-page.tsx → SSR demo route handler (JSX)
 */

import { serve } from 'bun'
import { isAbsolute, join, relative, resolve } from 'path'

import { doBuild, setupWatch } from './build.js'
import { renderSSRPage } from './ssr-page.js'

// ---------------------------------------------------------------------------
// Start-up flags
// ---------------------------------------------------------------------------

const isWatch   = Bun.argv.includes('--watch')
const skipBuild = Bun.argv.includes('--no-build')
const DEMO_DIR  = import.meta.dir

// ---------------------------------------------------------------------------
// Build step (skipped when the caller already built — e.g. `bun run demo`)
// ---------------------------------------------------------------------------

if (!skipBuild && !await doBuild()) {
  process.exit(1)
}

if (isWatch) {
  setupWatch()
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = ['http://localhost:3000']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (origin === '') return {}

  try {
    new URL(origin)
  } catch {
    return {}
  }

  if (origin === '*') return {}

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// ---------------------------------------------------------------------------
// Static file MIME types
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  html: 'text/html',
  css:  'text/css',
  js:   'application/javascript',
  json: 'application/json',
}

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Demo-appropriate CSP. Scripts stay strict ('self' only — no inline scripts);
  // inline styles are allowed because the framework's SSR `inlineStyles` feature
  // and runtime layout engine emit them, and Google Fonts are whitelisted.
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
// Server
// ---------------------------------------------------------------------------

serve({
  port: 3000,

  async fetch(req) {
    const url = new URL(req.url)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...corsHeaders(req) } })
    }

    // SSR demo route
    if (url.pathname === '/ssr') {
      // renderSSRPage() sets Content-Type + SECURITY_HEADERS but not CORS, so we
      // merge corsHeaders here. Otherwise the OPTIONS preflight would advertise
      // CORS while the actual GET lacks Access-Control-Allow-Origin, making every
      // cross-origin fetch fail.
      const res = await renderSSRPage(url)
      const cors = corsHeaders(req)
      for (const [key, value] of Object.entries(cors)) {
        res.headers.set(key, value)
      }
      return res
    }

    // Static file serving — map `/` to `index.html`
    const rawPath  = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = resolve(join(DEMO_DIR, rawPath))
    const rel      = relative(DEMO_DIR, filePath)

    if (isAbsolute(rel) || rel.split(/[\\/]/)[0] === '..') {
      return new Response('Forbidden', { status: 403, headers: { ...SECURITY_HEADERS, ...corsHeaders(req) } })
    }

    const file = Bun.file(filePath)

    if (!file.size) {
      return new Response('Not found', { status: 404, headers: { ...SECURITY_HEADERS, ...corsHeaders(req) } })
    }

    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    return new Response(file, {
      headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream', ...SECURITY_HEADERS, ...corsHeaders(req) },
    })
  },
})

console.log('🚀 Axiom Demo Launcher → http://localhost:3000')
console.log('🧱 Static demo → http://localhost:3000/static.html')
console.log('🧪 SSR demo → http://localhost:3000/ssr?name=Dev&width=960&root=ssr-root')
