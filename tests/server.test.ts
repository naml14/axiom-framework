import { describe, test, expect } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from '../src/server.js'
import { defineComponent } from '../src/index.js'
import { h } from '../src/syntax/h.js'

describe('createServer()', () => {
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
