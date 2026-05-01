import { describe, test, expect } from 'bun:test'
import { renderToReadableStream } from '../src/ssr-stream.js'
import { renderToString } from '../src/ssr.js'
import { defineComponent } from '../src/index.js'
import { h } from '../src/syntax/h.js'

// ============================================================
// Helpers
// ============================================================

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode() // flush
  return result
}

// ============================================================
// Tests
// ============================================================

describe('renderToReadableStream()', () => {
  test('produces valid HTML matching renderToString', async () => {
    const component = defineComponent(() => h('div', null, 'Hello Stream'))
    const stream = renderToReadableStream(component)
    const result = await readStream(stream)
    const expected = renderToString(component)
    expect(result).toBe(expected)
  })

  test('includes doctype and html structure', async () => {
    const component = defineComponent(() => h('main', null, 'Content'))
    const stream = renderToReadableStream(component)
    const result = await readStream(stream)

    expect(result).toStartWith('<!DOCTYPE html>')
    expect(result).toInclude('</html>')
    expect(result).toInclude('Content')
  })

  test('accepts SSRMetadata', async () => {
    const component = defineComponent(() => h('div', null, 'Meta'))
    const stream = renderToReadableStream(component, {
      metadata: { title: 'Stream Test', description: 'Testing stream SSR' },
    })
    const result = await readStream(stream)

    expect(result).toInclude('<title>Stream Test</title>')
    expect(result).toInclude('description" content="Testing stream SSR')
  })
})
