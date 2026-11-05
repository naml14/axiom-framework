import { describe, test, expect } from 'bun:test'
import { renderToReadableStream } from '../src/ssr-stream.js'
import { renderToString } from '../src/ssr.js'
import { defineComponent } from '../src/index.js'
import { h, fragment } from '../src/syntax/h.js'
import { clearLayoutPool, getLayoutPoolSize } from '../src/render/pool.js'

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

  test('serializes a large escaped document in successive chunks with exact parity', async () => {
    const component = defineComponent(() => fragment(
      h('main', { attrs: { title: '"<&', onclick: 'unsafe()' } },
        ...Array.from({ length: 200 }, (_, i) => h('p', null, `${i}: <&> 😀`)),
        h('img', { src: 'javascript:unsafe()' }),
        h('invalid tag', null, 'fallback')),
    ))
    const options = {
      width: 640, height: 480, lineHeight: 24, rootId: 'root"<&',
      metadata: {
        title: '<Stream>', description: '"<&', og: { title: '<&' },
        stylesheets: ['/safe.css', 'javascript:unsafe()'],
        inlineStyles: 'body{color:red}</style>', bodyStyle: 'color:red',
      },
    }
    clearLayoutPool()
    const reader = renderToReadableStream(component, options).getReader()
    const decoder = new TextDecoder()
    let result = ''
    let chunks = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks++
      result += decoder.decode(value, { stream: true })
    }
    result += decoder.decode()
    expect(chunks).toBeGreaterThan(1)
    expect(getLayoutPoolSize()).toBe(1)
    expect(result).toBe(renderToString(component, options))
    expect(result).toInclude('&lt;&amp;&gt; 😀')
    expect(result).not.toInclude('onclick=')
    expect(result).not.toInclude('javascript:')
  })

  test('only serializes requested chunks and cancellation releases the active layout', async () => {
    let serialized = 0
    const child = h('p', null, 'Not requested yet')
    child.attrs = { get title() { serialized++; return 'observed' } }
    const component = defineComponent(() => h('main', null, child))
    clearLayoutPool()
    const reader = renderToReadableStream(component).getReader()
    await Promise.resolve()
    expect(serialized).toBe(0)
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(new TextDecoder().decode(first.value)).toStartWith('<!DOCTYPE html>')
    expect(new TextDecoder().decode((await reader.read()).value)).toInclude('</head><body>')
    expect(new TextDecoder().decode((await reader.read()).value)).toStartWith('<main ')
    await Promise.resolve()
    expect(serialized).toBe(0)
    expect(getLayoutPoolSize()).toBe(0)
    await reader.cancel('stop')
    expect(await reader.read()).toEqual({ done: true, value: undefined })
    expect(serialized).toBe(0)
    expect(getLayoutPoolSize()).toBe(1)
  })

  test('cancellation before the first pull performs no rendering', async () => {
    let renders = 0
    const component = defineComponent(() => { renders++; return h('div', null, 'unused') })
    const stream = renderToReadableStream(component)
    await stream.cancel()
    expect(renders).toBe(0)
    expect(await stream.getReader().read()).toEqual({ done: true, value: undefined })
  })

  test('serialization errors reject reads and release the layout', async () => {
    const child = h('p', null, 'unreachable')
    child.attrs = { get title(): string { throw new Error('serialization failed') } }
    clearLayoutPool()
    const reader = renderToReadableStream(defineComponent(() => child)).getReader()
    let error: unknown
    try {
      while (!(await reader.read()).done) { /* drain until serialization fails */ }
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('serialization failed')
    expect(getLayoutPoolSize()).toBe(1)
    await expect(reader.read()).rejects.toThrow('serialization failed')
  })

  test('preserves Unicode pairs split across adjacent text nodes', async () => {
    const component = defineComponent(() => fragment('\ud83d', '\ude00'))
    const result = await readStream(renderToReadableStream(component))
    expect(result).toBe(renderToString(component))
    expect(result).toInclude('😀')
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

  test('escapes hostile text while preserving split Unicode', async () => {
    const component = defineComponent(() => fragment(
      h('p', {
        attrs: {
          title: '" onmouseover="evil()',
          onclick: 'evil()',
          href: 'javascript:evil()',
        },
      }, '<script>alert(1)</script><!--x-->'),
      '\ud83d', '', '\ude00', 'é', 'e', '\u0301', '中文',
    ))
    const html = renderToString(component)
    expect(await readStream(renderToReadableStream(component))).toBe(html)
    expect(html).toInclude('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toInclude('<script>')
    expect(html).not.toInclude('onclick=')
    expect(html).toInclude('href="#blocked"')
    expect(html).toInclude('😀ée\u0301中文')
  })

  test('releases layout when head serialization throws', async () => {
    clearLayoutPool()
    const component = defineComponent(() => h('p', null, 'x'))
    const metadata = {
      get title(): string { throw new Error('probe-head') },
    }
    await expect(readStream(
      renderToReadableStream(component, { metadata }),
    )).rejects.toThrow('probe-head')
    expect(getLayoutPoolSize()).toBe(1)
  })

  // Documented serialization order (docs/SSR-HYDRATION-CONTRACT.md §4): the
  // head, including the metadata, is serialized BEFORE the tree. A node whose
  // attribute accessor mutates the metadata therefore cannot change the head.
  test('serializes the head metadata before the tree content', () => {
    const metadata = { title: 'before' }
    const node = h('p', null, 'x')
    node.attrs = {
      get title(): string {
        metadata.title = 'after'
        return 'x'
      },
    }
    const html = renderToString(defineComponent(() => node), { metadata })
    expect(html).toInclude('<title>before</title>')
    expect(html).not.toInclude('<title>after</title>')
  })
})
