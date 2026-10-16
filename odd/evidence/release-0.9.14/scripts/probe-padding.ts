import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await p.goto('http://localhost:3000/static.html', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
const r = await p.evaluate(() => {
  const out: any = {}
  for (const id of ['syntax-h-v2-root', 'syntax-h-literal-root', 'ruta-b-grid-root', 'portal-demo-root', 'router-demo-root', 'context-demo-root', 'forms-demo-root']) {
    const el = document.getElementById(id); if (!el) continue
    const cs = getComputedStyle(el)
    const kid = el.firstElementChild as HTMLElement | null
    const kcs = kid ? getComputedStyle(kid) : null
    out[id] = {
      padding: cs.padding, position: cs.position, boxSizing: cs.boxSizing, width: cs.width, height: cs.height,
      child: kid ? { tag: kid.tagName.toLowerCase(), class: String(kid.className).slice(0, 40), position: kcs!.position, width: kcs!.width, height: kcs!.height, left: kcs!.left, top: kcs!.top } : null,
    }
  }
  // which CSS rule gives the syntax roots their padding?
  const probe = document.getElementById('syntax-h-v2-root')!
  const matched: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList; try { rules = sheet.cssRules } catch { continue }
    for (const rule of Array.from(rules)) {
      const cr = rule as CSSStyleRule
      if (!cr.selectorText) continue
      try { if (probe.matches(cr.selectorText) && cr.style.padding) matched.push(`${cr.selectorText} { padding: ${cr.style.padding} }`) } catch {}
    }
  }
  out.__matchedPaddingRules = matched
  return out
})
console.log(JSON.stringify(r, null, 1))
await b.close()
