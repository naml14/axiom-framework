/**
 * Build utilities for the Axiom demo server.
 *
 * Responsible for:
 * - Compiling the framework (tsc → dist/)
 * - Bundling the client demo app (Bun.build → demo/app.js)
 * - Optional file-system watch that triggers a rebuild on change
 */

import { dirname, join } from 'node:path'
import { watch, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type BunRuntimeLike = {
  spawnSync: (
    cmd: string[],
    options: { cwd: string; stdout: 'pipe'; stderr: 'pipe' }
  ) => { exitCode: number; stderr: Uint8Array }
  build: (options: {
    entrypoints: string[]
    outdir: string
    target: 'browser'
  }) => Promise<{ success: boolean; logs: unknown[] }>
}

const BunRuntime = (globalThis as { Bun?: BunRuntimeLike }).Bun
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function getBunRuntime(): BunRuntimeLike {
  if (!BunRuntime) {
    throw new Error('Bun runtime is required to build the demo. Run this script with Bun.')
  }

  return BunRuntime
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Compile the framework then bundle the demo client.
 * Returns `true` on success, `false` on any compilation error.
 */
export async function doBuild(): Promise<boolean> {
  const bun = getBunRuntime()

  console.log('📦 Building framework (dist)...')

  // Step 1 — typecheck + compile framework source → dist/
  const tsc = bun.spawnSync(['bunx', 'tsc', '--project', 'tsconfig.build.json'], {
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

  // Step 2 — bundle demo entry point for the browser using dist/ as source
  const result = await bun.build({
    entrypoints: [join(ROOT_DIR, 'demo', 'app.ts')],
    outdir: join(ROOT_DIR, 'demo'),
    target: 'browser',
  })

  if (!result.success) {
    console.error('❌ Demo bundle failed:')
    for (const msg of result.logs) console.error(msg)
    return false
  }

  console.log('✅ Built demo/app.js (from dist/)')
  return true
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------

/**
 * Watch source files and trigger a rebuild whenever a `.ts` or `.css` file
 * changes.  Call this after the initial build succeeds.
 */
export function setupWatch(): void {
  const watchPaths = [
    join(ROOT_DIR, 'demo', 'app.ts'),
    join(ROOT_DIR, 'src'),
  ]

  let rebuilding = false

  const onFileChange = (_eventType: 'rename' | 'change', filename: string | null): void => {
    if (rebuilding || !filename) return
    if (filename.endsWith('.ts') || filename.endsWith('.css')) {
      rebuilding = true
      console.log(`🔄 ${filename} changed — rebuilding...`)
      doBuild().finally(() => { rebuilding = false })
    }
  }

  const startWatch = (watchPath: string): void => {
    try {
      watch(watchPath, { recursive: true, encoding: 'utf8' }, onFileChange)
    } catch {
      try {
        watch(watchPath, { encoding: 'utf8' }, onFileChange)
        console.warn(`⚠️ Recursive watch not available for ${watchPath}; using non-recursive mode.`)
      } catch {
        console.warn(`⚠️ Could not watch path: ${watchPath}`)
      }
    }
  }

  for (const watchPath of watchPaths) {
    try {
      statSync(watchPath) // verify path exists before watching
      startWatch(watchPath)
    } catch {
      // path does not exist yet — skip silently
    }
  }

  console.log('👀 Watching for changes...')
}
