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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStatic, type BuildStaticOptions, type StaticRoute } from '../src/build.js'
import { defineComponent, h } from '../src/index.js'

// ============================================================
// Parse CLI arguments
// ============================================================

const args = process.argv.slice(2)
const outDir = extractArg(args, '--out-dir') ?? join(process.cwd(), 'dist', 'static')
const entry = extractArg(args, '--entry') ?? join(process.cwd(), 'src', 'static-routes.ts')

// ============================================================
// Resolve routes
// ============================================================

async function resolveRoutes(): Promise<StaticRoute[]> {
  // First, try to load a user-defined routes file
  if (existsSync(entry)) {
    try {
      const userRoutes = await import(entry)
      if (Array.isArray(userRoutes.default)) {
        return userRoutes.default as StaticRoute[]
      }
      if (Array.isArray(userRoutes.routes)) {
        return userRoutes.routes as StaticRoute[]
      }
    } catch (err) {
      console.warn(`[build:static] Could not load routes from ${entry}, using fallback.`)
    }
  }

  // Fallback: single-page build from src/app.ts
  const appEntry = join(process.cwd(), 'src', 'app.ts')
  if (existsSync(appEntry)) {
    try {
      const app = await import(appEntry)
      const component = app.default ?? app.App ?? app.app
      if (component) {
        return [{ path: '/', component }]
      }
    } catch {
      // fall through to demo fallback
    }
  }

  // Last fallback: minimal placeholder component
  console.warn('[build:static] No routes found. Generating placeholder page.')
  const Placeholder = defineComponent(() =>
    h('main', { style: { padding: '40px', fontFamily: 'sans-serif' } },
      h('h1', null, 'Axiom Static Site'),
      h('p', null, 'Define your routes in src/static-routes.ts'),
    )
  )
  return [{ path: '/', component: Placeholder }]
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

function extractArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  // Also support --name=value format
  for (const arg of args) {
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1)
    }
  }
  return undefined
}