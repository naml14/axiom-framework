import { serve } from 'bun'
import { join, dirname } from 'path'
import { watch, statSync } from 'fs'

const isWatch = Bun.argv.includes('--watch')
const skipBuild = Bun.argv.includes('--no-build')
const ROOT_DIR = join(import.meta.dir, '..')
const DEMO_DIR = import.meta.dir

type SSRModule = typeof import('../dist/index.js')
let ssrModulePromise: Promise<SSRModule> | null = null

function loadSSRModule(): Promise<SSRModule> {
  if (ssrModulePromise === null) {
    ssrModulePromise = import('../dist/index.js') as Promise<SSRModule>
  }
  return ssrModulePromise
}

async function renderSSRPage(url: URL): Promise<Response> {
  const { defineComponent, renderToString } = await loadSSRModule()

  const route = url.pathname
  const name = (url.searchParams.get('name') ?? 'Axiom').trim() || 'Axiom'
  const width = parseWidth(url.searchParams.get('width'))
  const rootId = sanitizeRootId(url.searchParams.get('root'))
  const qs = `?name=${encodeURIComponent(name)}&width=${width}&root=${encodeURIComponent(rootId)}`

  const SSRDemoApp = defineComponent(() => ({
    type: 'element' as const,
    tag: 'main',
    classes: ['ssr-shell', 'card'],
    attrs: {
      style: 'margin:24px auto;max-width:960px;background:#12121f;border:1px solid #2a2a4a;border-radius:14px;color:#e2e2f0;font-family:system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.35);',
    },
    layout: { flexDirection: 'column', gap: 12, padding: 20 },
    children: [
      {
        type: 'element' as const,
        tag: 'h1',
        attrs: { style: 'font-size:28px;font-weight:800;color:#a78bfa;' },
        children: [{ type: 'text' as const, content: 'SSR Demo — Axiom renderToString()' }],
      },
      {
        type: 'element' as const,
        tag: 'p',
        attrs: { style: 'color:#b2b2d0;' },
        children: [{ type: 'text' as const, content: `Hola ${name}, esta página fue renderizada en servidor con renderToString().` }],
      },
      {
        type: 'element' as const,
        tag: 'code',
        attrs: {
          style: 'display:block;padding:10px 12px;background:#0a0a14;border:1px solid #2a2a4a;border-radius:8px;color:#5eead4;',
        },
        children: [{ type: 'text' as const, content: `GET ${route}${qs}` }],
      },
      {
        type: 'element' as const,
        tag: 'div',
        layout: { flexDirection: 'column', gap: 6 },
        children: [
          {
            type: 'element' as const,
            tag: 'p',
            attrs: { style: 'color:#9ca3af;font-size:14px;' },
            children: [{ type: 'text' as const, content: `Ancho SSR: ${width}px · rootId: ${rootId}` }],
          },
          {
            type: 'element' as const,
            tag: 'p',
            attrs: { style: 'color:#9ca3af;font-size:14px;' },
            children: [{ type: 'text' as const, content: 'Tip: modifica query params para probar SSR.' }],
          },
          {
            type: 'element' as const,
            tag: 'p',
            attrs: { style: 'color:#e2e2f0;' },
            children: [
              { type: 'text' as const, content: 'Ejemplo: ' },
              {
                type: 'element' as const,
                tag: 'a',
                attrs: {
                  href: '/ssr?name=Dev&width=720&root=ssr-root',
                  style: 'color:#a78bfa;text-decoration:none;border-bottom:1px dashed #a78bfa;',
                },
                children: [{ type: 'text' as const, content: '/ssr?name=Dev&width=720&root=ssr-root' }],
              },
            ],
          },
        ],
      },
      { type: 'element' as const, tag: 'hr', attrs: { style: 'border:0;border-top:1px solid #2a2a4a;' } },
      {
        type: 'element' as const,
        tag: 'a',
        attrs: {
          href: '/',
          style: 'color:#5eead4;text-decoration:none;font-weight:700;',
        },
        children: [{ type: 'text' as const, content: '← Volver al demo interactivo' }],
      },
    ],
  }))

  const html = await renderToString(SSRDemoApp, {
    width,
    height: 720,
    url: `${url.pathname}${url.search}`,
    rootId,
    metadata: {
      title: 'Axiom SSR Demo',
      description: 'Demo SSR con renderToString, rootId configurable y layout consistente con cliente.',
      og: {
        type: 'website',
      },
    },
  })

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}

function parseWidth(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '960', 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 960
  return Math.max(320, Math.min(1600, parsed))
}

function sanitizeRootId(raw: string | null): string {
  const value = (raw ?? 'ssr-root').trim()
  if (value.length === 0) return 'ssr-root'
  return /^[A-Za-z_][\w-]*$/.test(value) ? value : 'ssr-root'
}

async function doBuild(): Promise<boolean> {
  console.log('📦 Building framework (dist)...')

  // Step 1: compile framework → dist/ (tsc)
  const tsc = Bun.spawnSync(['bunx', 'tsc', '--project', 'tsconfig.build.json'], {
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (tsc.exitCode !== 0) {
    console.error('❌ Framework typecheck/build failed:')
    console.error(new TextDecoder().decode(tsc.stderr))
    return false
  }

  console.log('📦 Building demo bundle (app.js)...')

  // Step 2: bundle demo → demo/app.js (using dist/ as source)
  const result = await Bun.build({
    entrypoints: ['demo/app.ts'],
    outdir: 'demo',
    target: 'browser',
  })

  if (!result.success) {
    console.error('❌ Demo bundle failed:')
    for (const msg of result.logs) {
      console.error(msg)
    }
    return false
  }

  console.log('✅ Built demo/app.js (from dist/)')
  return true
}

// Initial build (skip when called from `demo` command which already builds)
if (!skipBuild && !await doBuild()) {
  process.exit(1)
}

// Watch mode: rebuild on file changes
if (isWatch) {
  const watchPaths = [
    join(ROOT_DIR, 'demo', 'app.ts'),
    join(ROOT_DIR, 'src'),
  ]

  let rebuilding = false
  for (const wp of watchPaths) {
    try {
      statSync(wp) // verify path exists
      watch(wp, { recursive: true }, (eventType, filename) => {
        if (rebuilding) return
        if (filename && (filename.endsWith('.ts') || filename.endsWith('.css'))) {
          rebuilding = true
          console.log(`🔄 ${filename} changed — rebuilding...`)
          doBuild().finally(() => {
            rebuilding = false
          })
        }
      })
    } catch {
      // path doesn't exist yet, skip
    }
  }
  console.log('👀 Watching for changes...')
}

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/ssr') {
      return renderSSRPage(url)
    }

    let path = url.pathname === '/' ? '/index.html' : url.pathname

    const filePath = join(DEMO_DIR, path)
    const file = Bun.file(filePath)

    if (!file.size) {
      return new Response('Not found', { status: 404 })
    }

    const ext = path.split('.').pop()?.toLowerCase()
    const contentType: Record<string, string> = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
    }

    return new Response(file, {
      headers: {
        'Content-Type': contentType[ext ?? ''] ?? 'application/octet-stream',
      },
    })
  },
})

console.log('🚀 Axiom Demo → http://localhost:3000')
