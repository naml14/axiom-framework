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
import { join } from 'path'

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
// Static file MIME types
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  html: 'text/html',
  css:  'text/css',
  js:   'application/javascript',
  json: 'application/json',
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

serve({
  port: 3000,

  async fetch(req) {
    const url = new URL(req.url)

    // SSR demo route
    if (url.pathname === '/ssr') {
      return renderSSRPage(url)
    }

    // Static file serving — map `/` to `index.html`
    const filePath = join(DEMO_DIR, url.pathname === '/' ? '/index.html' : url.pathname)
    const file     = Bun.file(filePath)

    if (!file.size) {
      return new Response('Not found', { status: 404 })
    }

    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    return new Response(file, {
      headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
    })
  },
})

console.log('🚀 Axiom Demo Launcher → http://localhost:3000')
console.log('🧱 Static demo → http://localhost:3000/static.html')
console.log('🧪 SSR demo → http://localhost:3000/ssr?name=Dev&width=960&root=ssr-root')
