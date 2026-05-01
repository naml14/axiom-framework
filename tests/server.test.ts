import { describe, test, expect } from 'bun:test'
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
})
