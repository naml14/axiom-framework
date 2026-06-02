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

// ---------------------------------------------------------------------------
// Rate limiting — per-client bucketing (regression for PR #80 review)
// ---------------------------------------------------------------------------

describe('createServer() — rate limiting', () => {
  // Rate-limit state is per server instance, so tests cannot pollute each other.
  // Each test still uses a UNIQUE X-Forwarded-For IP to document and assert that
  // getClientIp() keys on a real client identity rather than one shared bucket.

  test('distinct client IPs get independent rate-limit buckets', async () => {
    // Regression: previously every request collapsed into one hardcoded
    // 127.0.0.1 bucket, so one abusive client could rate-limit everyone.
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({ routes: [{ path: '/', component }], port: 0 })

    try {
      server.serve()
      const base = `http://localhost:${server.port}/`

      const resA = await fetch(base, { headers: { 'X-Forwarded-For': '203.0.113.10' } })
      const resB = await fetch(base, { headers: { 'X-Forwarded-For': '203.0.113.20' } })

      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)
    } finally {
      server.stop()
    }
  })

  test('cf-connecting-ip is trusted over a spoofable X-Forwarded-For first entry', async () => {
    // A client behind Cloudflare can prepend an arbitrary X-Forwarded-For entry,
    // but cf-connecting-ip is set by the proxy. Two requests that share the same
    // cf-connecting-ip must land in the same bucket regardless of XFF.
    const component = defineComponent(() => h('div', null, 'Home'))
    const server = createServer({ routes: [{ path: '/', component }], port: 0 })

    try {
      server.serve()
      const base = `http://localhost:${server.port}/`
      const cfIp = '198.51.100.200'

      // Sanity: both requests succeed and key on cfIp, not the rotating XFF.
      const res1 = await fetch(base, {
        headers: { 'cf-connecting-ip': cfIp, 'X-Forwarded-For': '10.0.0.1' },
      })
      const res2 = await fetch(base, {
        headers: { 'cf-connecting-ip': cfIp, 'X-Forwarded-For': '10.0.0.2' },
      })

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
    } finally {
      server.stop()
    }
  })

  test('a single client IP is blocked with 429 once it exceeds RATE_LIMIT', async () => {
    const component = defineComponent(() => h('div', null, 'Home'))
    const allowedOrigin = 'https://app.example.com'
    const server = createServer({
      routes: [{ path: '/', component }],
      allowedOrigins: [allowedOrigin],
      port: 0,
    })
    const RATE_LIMIT = 100
    const clientIp = '198.51.100.77'

    try {
      server.serve()
      const base = `http://localhost:${server.port}/`
      const headers = { 'X-Forwarded-For': clientIp, Origin: allowedOrigin }

      // The first RATE_LIMIT requests are allowed.
      for (let i = 0; i < RATE_LIMIT; i++) {
        const res = await fetch(base, { headers })
        expect(res.status).toBe(200)
      }

      // The request beyond the limit is rejected. The 429 must still carry the
      // standard security headers AND the CORS headers, so error responses can't
      // silently drop CORS.
      const blocked = await fetch(base, { headers })
      expect(blocked.status).toBe(429)
      expect(blocked.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(blocked.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
      expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin)
    } finally {
      server.stop()
    }
  })
})
