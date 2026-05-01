#!/usr/bin/env bun
/**
 * build-static.ts — CLI entry point for Axiom Static Site Generation.
 *
 * Usage:
 *   bun run build:static                   # uses src/app.ts as entry
 *   bun run build:static --out-dir ./site  # custom output directory
 *
 * This script looks for a `src/static-routes.ts` file to define pages,
 * or falls back to a single-page build from `src/app.ts`.
 *
 * For advanced usage, import `buildStatic()` directly from 'axiom-framework'.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildStatic, type BuildStaticOptions, type StaticRoute } from '../src/build.js'
import { defineComponent, h } from '../src/index.js'

// ============================================================
// Parse CLI arguments
// ============================================================

type CliOptions = {
  outDir?: string
  entry?: string
}

const args = process.argv.slice(2)
const cliOptions = parseArgs(args)
const outDir = cliOptions.outDir ?? join(process.cwd(), 'dist', 'static')
const entry = cliOptions.entry ?? join(process.cwd(), 'src', 'static-routes.ts')

// ============================================================
// Resolve routes
// ============================================================

async function resolveRoutes(): Promise<StaticRoute[]> {
  return (
    await loadUserRoutes(entry) ??
    await loadAppFallback() ??
    createPlaceholderRoutes()
  )
}

// ============================================================
// Execute
// ============================================================

async function main() {
  console.log(`\n  📦 Axiom Static Build\n`)
  console.log(`  Output: ${outDir}\n`)

  const routes = await resolveRoutes()

  const options: BuildStaticOptions = {
    routes,
    outDir,
    minify: true,
  }

  const result = await buildStatic(options)

  console.log(`  ✅ Built ${result.routes} route(s)`)
  console.log(`  📁 ${result.files.length} files generated`)
  console.log(`  ⏱  ${result.durationMs}ms\n`)

  for (const file of result.files) {
    console.log(`     ${file}`)
  }
  console.log()
}

main().catch((err) => {
  console.error('[build:static] Failed:', err)
  process.exit(1)
})

// ============================================================
// Helpers
// ============================================================

async function loadUserRoutes(entryFile: string): Promise<StaticRoute[] | undefined> {
  if (!existsSync(entryFile)) return undefined

  try {
    const userRoutes = await import(entryFile)
    if (Array.isArray(userRoutes.default)) {
      return userRoutes.default as StaticRoute[]
    }
    if (Array.isArray(userRoutes.routes)) {
      return userRoutes.routes as StaticRoute[]
    }
  } catch {
    console.warn(`[build:static] Could not load routes from ${entryFile}, using fallback.`)
  }

  return undefined
}

async function loadAppFallback(): Promise<StaticRoute[] | undefined> {
  const appEntry = join(process.cwd(), 'src', 'app.ts')
  if (!existsSync(appEntry)) return undefined

  try {
    const app = await import(appEntry)
    const component = app.default ?? app.App ?? app.app
    if (component) {
      return [{ path: '/', component }]
    }
  } catch {
    // fall through to placeholder fallback
  }

  return undefined
}

function createPlaceholderRoutes(): StaticRoute[] {
  console.warn('[build:static] No routes found. Generating placeholder page.')
  const Placeholder = defineComponent(() =>
    h('main', { style: { padding: '40px', fontFamily: 'sans-serif' } },
      h('h1', null, 'Axiom Static Site'),
      h('p', null, 'Define your routes in src/static-routes.ts'),
    )
  )
  return [{ path: '/', component: Placeholder }]
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue

    if (arg === '--out-dir' && argv[i + 1]) {
      options.outDir = argv[++i]
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.slice('--out-dir='.length)
    } else if (arg === '--entry' && argv[i + 1]) {
      options.entry = argv[++i]
    } else if (arg.startsWith('--entry=')) {
      options.entry = arg.slice('--entry='.length)
    }
  }

  return options
}
