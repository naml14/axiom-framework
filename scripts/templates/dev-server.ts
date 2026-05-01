#!/usr/bin/env bun

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const indexHtml = readFileSync(join(import.meta.dir, 'index.html'), 'utf8')
const appEntry = join(import.meta.dir, 'src', 'app.ts')

async function buildAppBundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [appEntry],
    target: 'browser',
    format: 'esm',
    sourcemap: 'inline',
  })

  if (!result.success || result.outputs.length === 0) {
    return "throw new Error('Failed to build src/app.ts')"
  }

  const output = result.outputs[0]
  if (!output) {
    return "throw new Error('No outputs generated')"
  }
  return await output.text()
}

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/') {
      return new Response(indexHtml, {
        headers: { 'Content-Type': 'text/html' },
      })
    }
    if (url.pathname === '/src/app.ts') {
      const code = await buildAppBundle()
      return new Response(code, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log('🚀 Axiom starter dev server → http://localhost:3000')
