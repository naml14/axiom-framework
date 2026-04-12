import { describe, test, expect } from 'bun:test'
import { defineComponent, renderToString, createPortal } from '../src/index.js'

describe('SSR: renderToString', () => {
  test('genera HTML base válido', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'main',
      children: [{ type: 'text' as const, content: 'Hola SSR' }],
    }))

    const html = await renderToString(App)

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html>')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html).toContain('<div id="app">')
    expect(html).toContain('Hola SSR')
  })

  test('serializa texto y atributos con escape seguro', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      attrs: {
        title: 'x" y\' z <tag> &',
      },
      children: [{ type: 'text' as const, content: '<script>alert("x")</script> & "ok"' }],
    }))

    const html = await renderToString(App)

    expect(html).toContain('title="x&quot; y&#39; z &lt;tag&gt; &amp;"')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;ok&quot;')
    expect(html).not.toContain('<script>alert("x")</script>')
  })

  test('preserva estructura, attrs y classes, e incluye estilos de layout inline', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'section',
      classes: ['root', 'layout'],
      attrs: { 'data-role': 'content' },
      layout: { width: 320, height: 200 },
      children: [
        {
          type: 'element' as const,
          tag: 'p',
          classes: ['copy'],
          attrs: { id: 'lead' },
          children: [{ type: 'text' as const, content: 'Texto principal' }],
        },
      ],
    }))

    const html = await renderToString(App, { width: 320, height: 200 })

    expect(html).toContain('<section')
    expect(html).toContain('class="root layout"')
    expect(html).toContain('data-role="content"')
    expect(html).toContain('<p')
    expect(html).toContain('class="copy"')
    expect(html).toContain('id="lead"')
    expect(html).toMatch(/style="[^"]*left:0px;top:0px;width:\d+px;height:\d+px;[^"]*"/)
  })

  test('portal y fragment se serializan inline en v0.2.6', async () => {
    const fakeTarget = {} as HTMLElement

    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [
        {
          type: 'fragment' as const,
          children: [
            { type: 'element' as const, tag: 'span', children: [{ type: 'text' as const, content: 'Inline A' }] },
          ],
        },
        createPortal(
          [{ type: 'element' as const, tag: 'em', children: [{ type: 'text' as const, content: 'Portal Inline' }] }],
          fakeTarget
        ),
      ],
    }))

    const html = await renderToString(App)

    expect(html).toContain('<span')
    expect(html).toContain('Inline A')
    expect(html).toContain('<em')
    expect(html).toContain('Portal Inline')
  })

  test('inyecta metadata en head', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'SEO' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        title: 'Página SSR',
        description: 'Descripción <segura> & útil',
        og: {
          type: 'article',
          image: 'https://cdn.example.com/hero.png?x=1&y=2',
        },
      },
    })

    expect(html).toContain('<title>Página SSR</title>')
    expect(html).toContain('<meta name="description" content="Descripción &lt;segura&gt; &amp; útil">')
    expect(html).toContain('<meta property="og:type" content="article">')
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/hero.png?x=1&amp;y=2">')
  })

  test('policy router/url: acepta options.url sin tocar window en SSR', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'URL-safe SSR' }],
    }))

    const html = await renderToString(App, { url: '/post/42?tab=info#top' })
    expect(html).toContain('URL-safe SSR')
    expect(html).toContain('<div id="app">')
  })
})

describe('SSR: export público', () => {
  test('renderToString está expuesto desde entrypoint público', () => {
    expect(typeof renderToString).toBe('function')
  })
})
