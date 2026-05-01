/**
 * Build utilities for the Axiom demo server.
 *
 * Responsible for:
 * - Compiling the framework (tsc → dist/)
 * - Bundling the client demo app (Bun.build → demo/app.js)
 * - Generating a static build snapshot via buildStatic() → demo/static-out/
 * - Optional file-system watch that triggers a rebuild on change
 */

import { dirname, join } from 'node:path'
import { watch, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { WatchOptionsWithStringEncoding } from 'node:fs'
import { buildStatic } from '../src/build.js'
import { defineComponent } from '../src/index.js'
import { h } from '../src/syntax/h.js'

type BunBuildRuntime = {
  spawnSync: (
    cmd: string[],
    options: { cwd: string; stdout: 'pipe'; stderr: 'pipe' }
  ) => { exitCode: number; stdout: Uint8Array; stderr: Uint8Array }
  build: (options: {
    entrypoints: string[]
    outdir: string
    target: 'browser'
    minify?: boolean
  }) => Promise<{ success: boolean; logs: unknown[] }>
}

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

function getBun(): BunBuildRuntime {
  const bun = (globalThis as { Bun?: unknown }).Bun as BunBuildRuntime | undefined
  if (!bun) {
    throw new Error('Bun runtime is required to build the demo. Run this script with Bun.')
  }

  return bun
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Compile the framework then bundle the demo client.
 * Returns `true` on success, `false` on any compilation error.
 */
export async function doBuild(): Promise<boolean> {
  const bun = getBun()

  console.log('[build] Building framework (dist)...')

  // Step 1 — typecheck + compile framework source → dist/
  const tsc = bun.spawnSync(['bunx', 'tsc', '--project', 'tsconfig.build.json'], {
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (tsc.exitCode !== 0) {
    console.error('[build] Framework typecheck/build failed:')
    const stderr = new TextDecoder().decode(tsc.stderr).trim()
    const stdout = new TextDecoder().decode(tsc.stdout).trim()

    if (stderr.length > 0) console.error(stderr)
    if (stdout.length > 0) console.error(stdout)
    return false
  }

  console.log('[build] Building demo bundle (app.js)...')

  // Step 2 — bundle demo entry point for the browser using src/ as source.
  // Minify is always on: this bundle is a final browser artifact that nobody
  // re-processes downstream, so we ship it optimized.
  const result = await bun.build({
    entrypoints: [join(ROOT_DIR, 'demo', 'app.ts')],
    outdir: join(ROOT_DIR, 'demo'),
    target: 'browser',
    minify: true,
  })

  if (!result.success) {
    console.error('[build] Demo bundle failed:')
    for (const msg of result.logs) console.error(msg)
    return false
  }

  console.log('[build] Built demo/app.js (from src/)')
  return true
}

// ---------------------------------------------------------------------------
// Static site generation (demo snapshot)
// ---------------------------------------------------------------------------

/**
 * Generate a static HTML snapshot of the demo landing page using buildStatic().
 * Output goes to demo/static-out/ so it can be served from any CDN.
 */
export async function buildStaticDemo(): Promise<void> {
  const DemoHome = defineComponent(() =>
    h('main', { id: 'demo' },
      h('h1', {}, 'Axiom Framework Demo'),
      h('p', {}, 'This is a statically generated snapshot.'),
    )
  )

  const outDir = join(ROOT_DIR, 'demo', 'static-out')

  const result = await buildStatic({
    routes: [
      {
        path: '/',
        component: DemoHome,
        metadata: {
          title: 'Axiom Framework — Demo',
          description: 'Axiom reactive framework demo — static snapshot',
        },
      },
    ],
    outDir,
    minify: true,
    assets: {
      entrypoints: [join(ROOT_DIR, 'demo', 'app.ts')],
      outDir: join(outDir, 'assets'),
    },
  })

  console.log(`[build] Static site generated: ${result.routes} route(s), ${result.files.length} file(s) in ${result.durationMs}ms`)
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------

/**
 * Watch source files and trigger a rebuild whenever a `.ts` or `.css` file
 * changes.  Call this after the initial build succeeds.
 *
 * HMR notes:
 * - File changes are debounced 300ms to avoid rapid re-triggers on multi-file saves.
 * - The build pipeline recompiles the framework and rebundles the demo client.
 * - On a successful rebuild, the browser must refresh to pick up the new bundle
 *   (no WebSocket channel — by design, see design.md ADR-2).
 * - For in-browser hot reload recovery (enableHotReloadRecovery), the client app
 *   must call app.enableHotReloadRecovery() after mount.  Shape changes (e.g.
 *   changing component _id) require a full page reload.
 */
export function setupWatch(): void {
  const watchPaths = [
    join(ROOT_DIR, 'demo', 'app.ts'),
    join(ROOT_DIR, 'src'),
  ]

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let rebuilding = false

  // ============================================================
  // Debounced rebuild — 300ms window collapses rapid saves into
  // a single build.  The rebuilding flag prevents concurrent runs.
  // ============================================================

  function scheduleRebuild(filename: string): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (rebuilding) return
      rebuilding = true
      console.log(`[HMR] Change detected in ${filename} — rebuilding...`)
      doBuild().finally(() => { rebuilding = false })
    }, 300)
  }

  const onFileChange = (
    _eventType: 'rename' | 'change',
    filename: string | Buffer | null
  ): void => {
    if (!filename) return

    const normalizedFilename = typeof filename === 'string'
      ? filename
      : filename.toString('utf8')

    if (normalizedFilename.endsWith('.ts') || normalizedFilename.endsWith('.css')) {
      scheduleRebuild(normalizedFilename)
    }
  }

  function tryWatch(
    watchPath: string,
    options: WatchOptionsWithStringEncoding
  ): boolean {
    try {
      watch(watchPath, options, onFileChange)
      return true
    } catch {
      return false
    }
  }

  const startWatch = (watchPath: string): void => {
    if (tryWatch(watchPath, { recursive: true, encoding: 'utf8' })) return

    if (tryWatch(watchPath, { encoding: 'utf8' })) {
      console.warn(`[watch] Recursive watch not available for ${watchPath}; using non-recursive mode.`)
      return
    }

    console.warn(`[watch] Could not watch path: ${watchPath}`)
  }

  for (const watchPath of watchPaths) {
    try {
      statSync(watchPath) // verify path exists before watching
      startWatch(watchPath)
    } catch {
      // path does not exist yet — skip silently
    }
  }

  console.log('[watch] Watching for changes...')
}

if (isDirectRun) {
  const ok = await doBuild()
  if (ok) {
    await buildStaticDemo()
  }
  process.exit(ok ? 0 : 1)
}
