import { serve } from 'bun'
import { join, dirname } from 'path'
import { watch, statSync } from 'fs'

const isWatch = Bun.argv.includes('--watch')
const skipBuild = Bun.argv.includes('--no-build')
const ROOT_DIR = join(import.meta.dir, '..')
const DEMO_DIR = import.meta.dir

async function doBuild(): Promise<boolean> {
  console.log('📦 Building demo...')
  const result = await Bun.build({
    entrypoints: ['demo/app.ts'],
    outdir: 'demo',
    target: 'browser',
  })

  if (!result.success) {
    console.error('❌ Build failed:')
    for (const msg of result.logs) {
      console.error(msg)
    }
    return false
  }

  console.log('✅ Built demo/app.js')
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
  fetch(req) {
    const url = new URL(req.url)
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
