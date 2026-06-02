import { describe, test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineComponent, renderToString, createPortal } from '../src/index.js'
import { jsxDEV } from '../src/jsx-dev-runtime.js'
import { h } from '../src/syntax/h.js'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const ssrPagePath = join(repoRoot, 'demo', 'ssr-page.tsx')

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
    expect(html).toMatch(/style="position:absolute;left:0px;top:0px;transform:translate\(\d+px,\d+px\) var\(--animation-transform,\);width:\d+px;height:\d+px;box-sizing:border-box;margin:0;padding:0;/)
    // No border reset should be injected by the framework
    expect(html).not.toMatch(/style="[^"]*border:[^"]*"/)
    expect(html).not.toMatch(/style="[^"]*border-width:[^"]*"/)
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

  test('serializa attrs.style anidado desde JSX/h() en SSR', () => {
    const App = defineComponent(() => h('p', {
      attrs: {
        style: 'color:#a78bfa;font-weight:700;',
        title: 'styled-copy',
      },
    }, 'Styled copy'))

    const html = renderToString(App)

    expect(html).toContain('Styled copy')
    expect(html).toContain('title="styled-copy"')
    expect(html).toContain('color:#a78bfa;font-weight:700;')
  })
})

describe('SSR: export público', () => {
  test('renderToString está expuesto desde entrypoint público', () => {
    expect(typeof renderToString).toBe('function')
  })

  test('jsxDEV de desarrollo preserva props.children con firma de Bun/TypeScript', () => {
    const App = defineComponent(() => jsxDEV(
      'main',
      {
        flex: 'column',
        gap: 12,
        padding: 20,
        children: [
          jsxDEV('h1', { children: 'SSR Demo' }, undefined, false, undefined, undefined),
          jsxDEV('p', { children: ['Hola ', 'Dev'] }, undefined, true, undefined, undefined),
        ],
      },
      undefined,
      true,
      undefined,
      undefined,
    ))

    const html = renderToString(App, { width: 960, height: 720 })

    expect(html).toContain('<h1')
    expect(html).toContain('SSR Demo')
    expect(html).toContain('<p')
    expect(html).toContain('Hola Dev')
  })
})

describe('SSR: attrs security policy', () => {
  test('SSR output omits on* event attrs', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'button',
      attrs: {
        onclick: 'evil()',
        onerror: 'boom()',
        title: 'safe',
      },
      children: [{ type: 'text' as const, content: 'Click' }],
    }))

    const html = await renderToString(App)

    expect(html).toContain('<button')
    expect(html).toContain('title="safe"')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('onerror=')
  })

  test('SSR output neutralizes javascript: URLs to #blocked', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'a',
      attrs: {
        href: 'javascript:alert(1)',
      },
      children: [{ type: 'text' as const, content: 'Dangerous link' }],
    }))

    const html = await renderToString(App)

    expect(html).toContain('href="#blocked"')
    expect(html).not.toContain('href="javascript:alert(1)"')
  })

  // --- SSR/Client consistency (eliminate-next-anonymous-id-global) ---

  test('anonymous component display name is deterministic across simulated SSR and client init', async () => {
    // "SSR path": define the component (simulating server-side init)
    const ssrComponent = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'SSR' }],
    }))

    // "Client path": define a component with the exact same source (simulating client hydration init)
    const clientComponent = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'SSR' }],
    }))

    // Both should resolve to the same deterministic display name
    expect(ssrComponent.displayName).toMatch(/^Component#[0-9a-f]{8}$/)
    expect(ssrComponent.displayName).toBe(clientComponent.displayName)
  })
})

describe('SSR: bodyStyle sanitization', () => {
  test('bodyStyle with url(data:...) is sanitized', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        bodyStyle: 'background: url(data:text/html,<script>alert(1)</script>)',
      },
    })

    // url( is stripped, neutralizing the exfiltration vector
    expect(html).not.toContain('url(data:text/html')
  })

  test('bodyStyle with @import is sanitized', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        bodyStyle: '@import url("https://evil.com/steal.css")',
      },
    })

    expect(html).not.toContain('@import')
  })

  test('bodyStyle with expression() is sanitized', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        bodyStyle: 'width: expression(alert(1))',
      },
    })

    expect(html).not.toContain('expression')
  })

  test('bodyStyle with javascript: is sanitized', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        bodyStyle: 'background: javascript:alert(1)',
      },
    })

    expect(html).not.toContain('javascript:')
  })

  test('bodyStyle preserves legitimate CSS properties', async () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))

    const html = await renderToString(App, {
      metadata: {
        bodyStyle: 'color: red; font-size: 16px; margin: 0;',
      },
    })

    expect(html).toContain('color: red')
    expect(html).toContain('font-size: 16px')
    expect(html).toContain('margin: 0')
  })
})

describe('SSR: stylesheet origin policy', () => {
  function makeApp() {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))
  }

  test('relative href is emitted as-is', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['/styles.css'] },
    })
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
  })

  test('https CDN href is emitted — regression: previously blocked by ALLOWED_STYLESHEET_ORIGIN', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['https://fonts.googleapis.com/css?family=Roboto'] },
    })
    expect(html).toContain('href="https://fonts.googleapis.com/css?family=Roboto"')
    expect(html).toContain('<link rel="stylesheet"')
  })

  test('http href is emitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['http://example.com/styles.css'] },
    })
    expect(html).toContain('<link rel="stylesheet" href="http://example.com/styles.css">')
  })

  test('javascript: href is omitted entirely — no <link> tag emitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['javascript:alert(1)'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('javascript:')
  })

  test('data: href is omitted entirely', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['data:text/css,body{background:red}'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('data:text/css')
  })

  test('vbscript: and file: hrefs are omitted entirely', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['vbscript:msgbox(1)', 'file:///etc/passwd'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('vbscript:')
    expect(html).not.toContain('file://')
  })

  test('protocol-relative href is omitted entirely', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['//evil.com/x.css'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('//evil.com')
  })

  test('href with HTML-special chars is escaped in output', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['/path?a=1&b="2"'] },
    })
    expect(html).toContain('href="/path?a=1&amp;b=&quot;2&quot;"')
  })

  test('mixed list: safe hrefs emitted, dangerous ones omitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: {
        stylesheets: [
          '/a.css',
          'https://b.com/b.css',
          'javascript:c',
          '//d.com/d.css',
        ],
      },
    })
    expect(html).toContain('href="/a.css"')
    expect(html).toContain('href="https://b.com/b.css"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('//d.com')
    // Only 2 link tags emitted
    expect((html.match(/<link rel="stylesheet"/g) ?? []).length).toBe(2)
  })

  test('empty stylesheets array emits no link tags', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: [] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
  })

  test('undefined stylesheets emits no link tags', async () => {
    const html = await renderToString(makeApp(), {
      metadata: {},
    })
    expect(html).not.toContain('<link rel="stylesheet"')
  })
})

describe('SSR demo: security headers', () => {
  test('demo/ssr-page.tsx defines SECURITY_HEADERS constant', async () => {
    const source = await readFile(ssrPagePath, 'utf8')
    expect(source).toContain("const SECURITY_HEADERS: Record<string, string> = {")
  })

  test('SECURITY_HEADERS includes all five required headers', async () => {
    const source = await readFile(ssrPagePath, 'utf8')
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'")
    expect(source).toContain("'X-Frame-Options': 'SAMEORIGIN'")
    expect(source).toContain("'Referrer-Policy': 'strict-origin-when-cross-origin'")
    expect(source).toContain("'Content-Security-Policy'")
    expect(source).toContain("'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'")
  })

  test('SECURITY_HEADERS CSP includes style-src for inline SSR styles', async () => {
    const source = await readFile(ssrPagePath, 'utf8')
    expect(source).toContain("'unsafe-inline'")
  })

  test('renderSSRPage merges SECURITY_HEADERS into Response headers', async () => {
    const source = await readFile(ssrPagePath, 'utf8')
    expect(source).toMatch(/\.\.\.SECURITY_HEADERS/)
  })
})

describe('SSR: stylesheet origin policy', () => {
  function makeApp() {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      children: [{ type: 'text' as const, content: 'test' }],
    }))
  }

  test('relative href is emitted as-is', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['/styles.css'] },
    })
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
  })

  test('https CDN href is emitted (must not drop valid CDN links)', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['https://fonts.googleapis.com/css?family=Roboto'] },
    })
    expect(html).toContain('href="https://fonts.googleapis.com/css?family=Roboto"')
    expect(html).toContain('<link rel="stylesheet"')
  })

  test('http href is emitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['http://example.com/styles.css'] },
    })
    expect(html).toContain('<link rel="stylesheet" href="http://example.com/styles.css">')
  })

  test('javascript: href is omitted entirely — no <link> tag emitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['javascript:alert(1)'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('javascript:')
  })

  test('data: href is omitted entirely', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['data:text/css,body{background:red}'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('data:text/css')
  })

  test('vbscript: and file: hrefs are omitted entirely', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['vbscript:msgbox(1)', 'file:///etc/passwd'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('vbscript:')
    expect(html).not.toContain('file://')
  })

  test('protocol-relative hrefs are omitted (slash and backslash variants)', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['//evil.com/x.css', '/\\evil.com/y.css', '\\\\evil.com/z.css'] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toContain('evil.com')
  })

  test('href with HTML-special chars is escaped in output', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: ['/path?a=1&b="2"'] },
    })
    expect(html).toContain('href="/path?a=1&amp;b=&quot;2&quot;"')
  })

  test('mixed list: safe hrefs emitted, dangerous ones omitted', async () => {
    const html = await renderToString(makeApp(), {
      metadata: {
        stylesheets: [
          '/a.css',
          'https://b.com/b.css',
          'javascript:c',
          '//d.com/d.css',
        ],
      },
    })
    expect(html).toContain('href="/a.css"')
    expect(html).toContain('href="https://b.com/b.css"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('//d.com')
    // Only 2 link tags emitted
    expect((html.match(/<link rel="stylesheet"/g) ?? []).length).toBe(2)
  })

  test('empty stylesheets array emits no link tags', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { stylesheets: [] },
    })
    expect(html).not.toContain('<link rel="stylesheet"')
  })

  test('undefined stylesheets emits no link tags', async () => {
    const html = await renderToString(makeApp(), {
      metadata: {},
    })
    expect(html).not.toContain('<link rel="stylesheet"')
  })
})
