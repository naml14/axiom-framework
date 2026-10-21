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

// --- T7 (WU3.1, decisión S1): base64 media data URLs in SSR inline styles ---
// Policy parity with sanitizeUrlValue() (src/core/attrs.ts): base64 data URLs
// survive with the exact subtype set attrs.ts permits per top-level type —
// image only as {png,jpeg,jpg,gif,webp,bmp,ico,avif,svg+xml}, audio/video any
// subtype. Every other url(...) construct keeps being stripped.
// The payload class excludes \s so unterminated inputs stay linear (ReDoS pin).
describe('SSR: safe base64 data URLs in inline styles (T7 / S1)', () => {
  function makeApp(attrs?: Record<string, string>) {
    return defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      attrs,
      children: [{ type: 'text' as const, content: 'test' }],
    }))
  }

  test('inlineStyles preserves base64 media data URLs verbatim (png, svg+xml base64, audio)', async () => {
    const css =
      '.a{background-image:url(data:image/png;base64,iVBORw0KGgo=)}' +
      '.b{background:url("data:image/svg+xml;base64,PHN2ZyB4bYxucz0i")}' +
      ".c{background:url('data:audio/mpeg;base64,AAA=')}"

    const html = await renderToString(makeApp(), {
      metadata: { inlineStyles: css },
    })

    expect(html).toContain('url(data:image/png;base64,iVBORw0KGgo=)')
    expect(html).toContain('url("data:image/svg+xml;base64,PHN2ZyB4bYxucz0i")')
    expect(html).toContain("url('data:audio/mpeg;base64,AAA=')")
    // Nothing dangerous in the input, so the <style> block must be byte-identical.
    expect(html).toContain(`<style>${css}</style>`)
  })

  test('attrs.style (sanitizeCssProperty) preserves base64 image data URL', async () => {
    const html = await renderToString(
      makeApp({ style: 'background-image:url(data:image/png;base64,iVBORw0KGgo=)' })
    )

    expect(html).toContain('background-image:url(data:image/png;base64,iVBORw0KGgo=)')
  })

  test('bodyStyle preserves base64 video data URL', async () => {
    const html = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:url(data:video/mp4;base64,AAAAIGZ0eXBpc29t)' },
    })

    expect(html).toContain('background:url(data:video/mp4;base64,AAAAIGZ0eXBpc29t)')
  })

  test('non-media, non-base64 and remote url() are still stripped', async () => {
    // Remote https URL — url( token stripped (residual bare text is inert CSS)
    const remote = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:url(https://evil.example/x.png)' },
    })
    expect(remote).not.toContain('url(')

    // javascript: inside url()
    const js = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:url(javascript:alert(1))' },
    })
    expect(js).not.toContain('url(')
    expect(js).not.toContain('javascript:')

    // data: with non-media type (text/html) — attrs.ts blocks these too
    const textHtml = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:url(data:text/html;base64,PHA+)' },
    })
    expect(textHtml).not.toContain('url(')
    expect(textHtml).not.toContain('url(data:text/html')

    // Inline (non-base64) SVG data URL — XSS vector, blocked like attrs.ts
    const inlineSvg = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:url(data:image/svg+xml,<svg onload=alert(1)>)' },
    })
    expect(inlineSvg).not.toContain('url(')
  })

  test('mixed value: safe data URL kept, remote url() stripped', async () => {
    const html = await renderToString(makeApp(), {
      metadata: {
        inlineStyles: '.a{background:url(data:image/png;base64,AA) url(https://x);}',
      },
    })

    expect(html).toContain('url(data:image/png;base64,AA)')
    expect(html).not.toContain('url(https://x)')
    // Exactly one live url( token survives — the preserved safe one.
    expect((html.match(/\burl\s*\(/gi) ?? []).length).toBe(1)
  })

  test('collapse attack via ururl(...) neither extracts nor reconstructs a live url( token', async () => {
    // `ururl(` has no word boundary before `url`, so the allowlist does NOT
    // extract it; CSS tokenizes it as an inert FUNCTION token named `ururl`,
    // never as `url(`. Assert at token level (same \b semantics as the
    // sanitizer) that no live url( or javascript: survives.
    const html = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:ururl(data:image/png;base64,AAA)l(' },
    })

    expect(html).not.toMatch(/(?:^|[^A-Za-z0-9_-])url\s*\(/i)
    expect(html).not.toContain('javascript:')
  })

  test('loop-stable stripping neutralizes reconstruction into a live url(', async () => {
    // Removing `javascript:` reconstructs `url(` — the loop-until-stable must
    // strip the reconstruction even though extraction already ran.
    const html = await renderToString(makeApp(), {
      metadata: { bodyStyle: 'background:urjavascript:l(https://evil.example)' },
    })

    expect(html).not.toContain('url(')
    expect(html).not.toContain('javascript:')
  })

  test('guessed placeholder text in user input never forges a restoration', async () => {
    // The real placeholder is \x00 + per-call random hex nonce + index + \x00,
    // so guessed shapes must pass through literally and never be replaced by
    // the preserved URL of another match.
    const guessed =
      '\u0000axiom0\u0000;\u0000axiom-css-safe-url-0\u0000;\u0000axiom-css-safe-url-0000000000000000-0\u0000'
    const html = await renderToString(makeApp(), {
      metadata: {
        bodyStyle: `background:url(data:image/png;base64,AAA=);color:${guessed}`,
      },
    })

    // The one legitimate data URL survives exactly once…
    expect((html.match(/url\(data:image\/png;base64,AAA=\)/g) ?? []).length).toBe(1)
    // …the guessed placeholders stay literal (no forged restoration).
    expect(html).toContain('\u0000axiom0\u0000')
    expect(html).toContain('\u0000axiom-css-safe-url-0000000000000000-0\u0000')
    // Only the preserved safe url( token exists in the output.
    expect((html.match(/\burl\s*\(/gi) ?? []).length).toBe(1)
  })

  test('many preserved URLs use a single global restoration pass', async () => {
    const css = Array.from({ length: 1_000 }, (_, i) =>
      `.a${i}{background:url(data:image/png;base64,AAA=)}`
    ).join('')
    const html = renderToString(makeApp(), { metadata: { inlineStyles: css } })
    expect(html).toContain(`<style>${css}</style>`)

    // Structural complexity pin: restoration must not traverse CSS per URL.
    const source = await readFile(join(repoRoot, 'src/ssr.ts'), 'utf8')
    const restoration = source.slice(source.indexOf('// 3. Restore'), source.indexOf('/**\n * Sanitizes a single'))
    expect(restoration).not.toMatch(/\b(?:for|while)\s*\(/)
    expect(restoration.match(/\.replace\(/g)).toHaveLength(1)
    expect(restoration).toContain("new RegExp(`\\u0000axiom-css-safe-url-${nonce}-(\\\\d+)\\u0000`, 'g')")
  })

  test('base64 payload alphabet excludes whitespace overlapping the closing delimiter', async () => {
    const source = await readFile(join(repoRoot, 'src/ssr.ts'), 'utf8')
    const pattern = source.match(/const SAFE_CSS_DATA_URL_RE\s*=\s*\/([^\n]+)\/gi/)?.[1]
    expect(pattern).toBeDefined()
    // Deterministic ReDoS pin: adjacent overlapping whitespace quantifiers
    // caused the historical 9.6s backtracking, regardless of runner speed.
    const hasDisjointPayload = (regexSource: string) =>
      regexSource.includes(String.raw`;base64,[A-Za-z0-9+\/=]*\1\s*\)`)
    expect(hasDisjointPayload(pattern!)).toBe(true)
    // The historical vulnerable alphabet must fail this structural guard.
    expect(hasDisjointPayload(pattern!.replace('[A-Za-z0-9+\\/=]', '[A-Za-z0-9+\\/=\\s]'))).toBe(false)
  })

  test('unterminated base64 url( with 200KB of spaces is inert without a wall-clock threshold', async () => {
    // ReDoS pin: the payload class must not include \s, or it overlaps the
    // trailing `\1\s*\)` and backtracks quadratically on an unterminated
    // `url(data:image/png;base64,` + N spaces input (9.6s at 200KB before fix).
    const payload = 'background:url(data:image/png;base64,' + ' '.repeat(200_000)
    const html = await renderToString(makeApp(), {
      metadata: { bodyStyle: payload },
    })

    expect(html).toContain('background:data:image/png;base64,' + ' '.repeat(200_000))
    // No live url( token survives — the unterminated data URL is stripped.
    expect((html.match(/\burl\s*\(/gi) ?? []).length).toBe(0)
  })

  test('image subtypes outside the attrs.ts allowlist are stripped (parity pin)', async () => {
    // attrs.ts (SAFE_DATA_URL_RE / SAFE_SVG_DATA_URL_RE) admits only
    // png|jpeg|jpg|gif|webp|bmp|ico|avif and svg+xml (base64). SSR must not
    // be looser: tiff, x-icon, APNG and svgxml (no +xml) must not survive.
    const rejected = ['tiff', 'x-icon', 'APNG', 'svgxml']
    for (const subtype of rejected) {
      const html = await renderToString(makeApp(), {
        metadata: { bodyStyle: `background:url(data:image/${subtype};base64,AAA=)` },
      })
      expect((html.match(/\burl\s*\(/gi) ?? []).length).toBe(0)
    }
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

describe('API stability documentation generation', () => {
  test('generator preserves the complete promotion policy from the published contract', async () => {
    const doc = await readFile(join(repoRoot, 'docs/STABILITY.md'), 'utf8')
    const generator = await readFile(join(repoRoot, 'scripts/validate-api-stability.ts'), 'utf8')
    const policy = doc.slice(doc.indexOf('### Promotion policy'), doc.indexOf('## Enforcement')).trim()
    expect(policy).toContain('Promotion to stable requires, per export:')
    // Template literals escape Markdown backticks; compare rendered text.
    const template = generator.slice(generator.indexOf('const content ='), generator.indexOf('const outputPath ='))
    expect(template.replaceAll('\\`', '`')).toContain(policy)
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

