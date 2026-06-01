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

  test('accepts a plain-object component definition (e.g. defineAsyncComponent output)', async () => {
    // A ComponentDefinition is an object with a callable `_fn`. Unlike
    // defineComponent (which returns a callable function), object-form
    // definitions must NOT be rejected by the runtime validation.
    const objComponent = {
      _id: Symbol('obj-component'),
      _fn: () => h('section', null, 'Object Component'),
    }

    const stream = renderToReadableStream(objComponent)
    const result = await readStream(stream)

    expect(result).toStartWith('<!DOCTYPE html>')
    expect(result).toInclude('Object Component')
  })

  test('throws on invalid component input', () => {
    expect(() => renderToReadableStream(null as never)).toThrow(
      'renderToReadableStream() requires a valid component definition'
    )
    expect(() => renderToReadableStream({} as never)).toThrow(
      'renderToReadableStream() requires a valid component definition'
    )
    expect(() => renderToReadableStream('nope' as never)).toThrow(
      'renderToReadableStream() requires a valid component definition'
    )
  })
})
