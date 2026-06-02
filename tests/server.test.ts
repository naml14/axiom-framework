import { describe, test, expect } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from '../src/server.js'
import { defineComponent } from '../src/index.js'
import { h } from '../src/syntax/h.js'

// ---------------------------------------------------------------------------
// CORS Origin Reflection — allowlist behavior
// ---------------------------------------------------------------------------

describe('corsHeaders() — origin allowlist', () => {
  test('no allowedOrigins configured → no CORS headers on any request', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('origin not in allowedOrigins → no CORS headers', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://attacker.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('origin in allowedOrigins → CORS headers reflected', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect(res.headers.get('Vary')).toBe('Origin')

    server.stop()
  })

  test('malformed origin → no CORS headers', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'http://' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('empty origin → no CORS headers', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: {},
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('wildcard * in allowedOrigins → no CORS headers', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['*'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('multiple origins → only matching one is reflected', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com', 'https://app.example.com'],
      port: 0,
    })

    server.serve()

    const res1 = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(res1.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')

    const res2 = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://app.example.com' },
    })
    expect(res2.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')

    const res3 = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://other.com' },
    })
    expect(res3.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })

  test('allowedOrigins is normalized (trimmed, empty entries ignored, wildcard ignored)', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['  https://example.com  ', '   ', '*', ' * '],
      port: 0,
    })

    server.serve()

    const allowedRes = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(allowedRes.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')

    const blockedRes = await fetch(`http://localhost:${server.port}/`, {
      headers: { Origin: 'https://other.com' },
    })
    expect(blockedRes.headers.get('Access-Control-Allow-Origin')).toBeNull()

    server.stop()
  })
})

describe('createServer()', () => {
  test('throws when staticDir does not exist', () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    expect(() =>
      createServer({
        routes: [{ path: '/', component }],
        staticDir: 'this-dir-should-not-exist-axiom-test',
      })
    ).toThrow('createServer() staticDir does not exist')
  })

  test('throws when staticDir is not a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'axiom-server-static-'))
    const filePath = join(dir, 'static-file.txt')
    await writeFile(filePath, 'content', 'utf8')

    const component = defineComponent(() => h('div', null, 'Home'))

    try {
      expect(() =>
        createServer({
          routes: [{ path: '/', component }],
          staticDir: filePath,
        })
      ).toThrow('createServer() staticDir must be a directory')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('starts and serves a route', async () => {
    const component = defineComponent(() => h('div', null, 'Hello Server'))
    const server = createServer({
      routes: [{ path: '/', component }],
      port: 0, // random port
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toInclude('Hello Server')
    expect(text).toInclude('<!DOCTYPE html>')

    server.stop()
  })

  test('returns 404 for unknown routes', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/not-found`)
    expect(res.status).toBe(404)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')

    server.stop()
  })

  test('OPTIONS preflight returns security headers and CORS when origin is allowed', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: ['https://example.com'],
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com' },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')

    server.stop()
  })

  test('serves static files when staticDir is configured', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      staticDir: '.',
      port: 0,
    })

    server.serve()

    const res = await fetch(`http://localhost:${server.port}/package.json`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('axiom-framework')

    server.stop()
  })

  test('blocks static file path traversal outside staticDir', async () => {
    const staticDir = await mkdtemp(join(tmpdir(), 'axiom-server-static-'))
    const insideFile = join(staticDir, 'hello.txt')
    const outsideFile = join(staticDir, '..', 'outside.txt')
    await writeFile(insideFile, 'inside', 'utf8')
    await writeFile(outsideFile, 'outside', 'utf8')

    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({
      routes: [{ path: '/', component }],
      staticDir,
      port: 0,
    })

    try {
      server.serve()

      const safeRes = await fetch(`http://localhost:${server.port}/hello.txt`)
      expect(safeRes.status).toBe(200)
      expect(await safeRes.text()).toBe('inside')

      const traversalRes = await fetch(`http://localhost:${server.port}/..%2Foutside.txt`)
      expect(traversalRes.status).toBe(404)
    } finally {
      server.stop()
      await rm(staticDir, { recursive: true, force: true })
      await rm(outsideFile, { force: true })
    }
  })

  test('passes route metadata to streaming SSR responses', async () => {
    const component = defineComponent(() => h('div', null, 'SEO Page'))
    const server = createServer({
      routes: [
        {
          path: '/',
          component,
          metadata: {
            title: 'SEO Title',
            description: 'SEO Description',
          },
        },
      ],
      port: 0,
    })

    try {
      server.serve()

      const res = await fetch(`http://localhost:${server.port}/`)
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toInclude('<title>SEO Title</title>')
      expect(text).toInclude('content="SEO Description"')
    } finally {
      server.stop()
    }
  })
})
