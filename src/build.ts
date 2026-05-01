// ============================================================
// axiom-framework — Static Site Generation (buildStatic API)
// ============================================================
//
// `buildStatic()` generates static HTML/CSS/JS from a set of route
// definitions. It is a @stable API as of v0.9.x (forward-compatible to v1.0).
//
// Data flow:
//   buildStatic({ routes, outDir })
//     │
//     ├─ for each route:
//     │   ├─ renderToString(component, { metadata }) → HTML string
//     │   └─ writeFile(outDir/<path>/index.html)
//     │
//     ├─ Bun.build({ entrypoints, outDir/assets, minify }) → JS bundle(s)
//     │
//     └─ write asset-manifest.json
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { ComponentDefinition } from './core/types.js'
import type { SSRMetadata } from './ssr.js'
import { renderToString } from './ssr.js'

// ============================================================
// Interfaces
// ============================================================

export interface StaticRoute {
  path: string
  component: ComponentDefinition<void>
  metadata?: SSRMetadata
}

export interface BuildStaticOptions {
  routes: StaticRoute[]
  outDir: string
  /** URL prefix for all routes. Default: '/' */
  basePath?: string
  /** Minify JS bundle output. Default: true */
  minify?: boolean
  assets?: {
    /** JS entry points to bundle for the browser. */
    entrypoints: string[]
    /** Output directory for bundled assets. Default: outDir/assets */
    outDir?: string
  }
}

export interface BuildResult {
  routes: number
  /** Absolute paths of every file written to disk. */
  files: string[]
  durationMs: number
}

// ============================================================
// Internal helpers
// ============================================================

/** Resolve a route path to a filesystem directory suitable for index.html. */
function routeToDir(outDir: string, routePath: string): string {
  // Normalise: strip leading slash, collapse '.' and '..'
  const clean = posix.normalize(routePath.replace(/^\/+/, '') || '.')
  if (clean === '.') return outDir
  return join(outDir, ...clean.split('/'))
}

// ============================================================
// Bun.build wrapper — typed just enough for our needs
// ============================================================

interface BunBuildOutput {
  success: boolean
  logs: unknown[]
  outputs: Array<{ path: string }>
}

interface BunRuntime {
  build(options: {
    entrypoints: string[]
    outdir: string
    target: 'browser'
    minify?: boolean
  }): Promise<BunBuildOutput>
}

function getBunRuntime(): BunRuntime {
  const bun = (globalThis as { Bun?: unknown }).Bun as BunRuntime | undefined
  if (!bun) {
    throw new Error(
      'buildStatic() requires the Bun runtime. Run this script with `bun run`.'
    )
  }
  return bun
}

// ============================================================
// buildStatic()
// ============================================================

/**
 * Generate a full static site from a set of route definitions.
 *
 * @stable
 */
export async function buildStatic(options: BuildStaticOptions): Promise<BuildResult> {
  const start = Date.now()
  const {
    routes,
    outDir,
    minify = true,
    assets,
  } = options

  // Ensure outDir exists even when there are no routes.
  await mkdir(outDir, { recursive: true })

  const writtenFiles: string[] = []

  // ---- Phase 1: HTML per route ----
  for (const route of routes) {
    const dir = routeToDir(outDir, route.path)
    await mkdir(dir, { recursive: true })

    const html = renderToString(route.component, { metadata: route.metadata })
    const filePath = join(dir, 'index.html')
    await writeFile(filePath, html, 'utf8')
    writtenFiles.push(filePath)
  }

  // ---- Phase 2: JS bundle (optional) ----
  if (assets !== undefined && assets.entrypoints.length > 0) {
    const assetsOutDir = assets.outDir ?? join(outDir, 'assets')
    await mkdir(assetsOutDir, { recursive: true })

    const bun = getBunRuntime()
    const result = await bun.build({
      entrypoints: assets.entrypoints,
      outdir: assetsOutDir,
      target: 'browser',
      minify,
    })

    if (!result.success) {
      const msgs = result.logs.map(l => String(l)).join('\n')
      throw new Error(`buildStatic: JS bundle failed.\n${msgs}`)
    }

    for (const output of result.outputs) {
      writtenFiles.push(output.path)
    }
  }

  // ---- Phase 3: Asset manifest ----
  const manifestPath = join(outDir, 'asset-manifest.json')
  // Add manifest to the files list before writing so the manifest's own
  // `files` array is self-consistent with the returned BuildResult.
  writtenFiles.push(manifestPath)
  const manifest = {
    generated: new Date().toISOString(),
    routes: routes.map(r => r.path),
    files: writtenFiles,
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  return {
    routes: routes.length,
    files: writtenFiles,
    durationMs: Date.now() - start,
  }
}
