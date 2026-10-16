/**
 * Focused diagnostic for the 5 FAILs of verify-demo.ts, plus a corrected
 * two-field forms check (the first pass only filled the email field, so the
 * empty username kept a legitimate `.form-status--invalid`).
 */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:3000'
const OUT = 'E:/trabajo/Axiom/.verify-tmp/evidence'

const ROOT_IDS = [
  'context-demo-root', 'forms-demo-root', 'router-demo-root', 'portal-demo-root',
  'ruta-b-grid-root', 'syntax-flow-root', 'syntax-jsx-root', 'syntax-layout-root',
  'syntax-h-v2-root', 'syntax-h-literal-root', 'syntax-events-root',
]

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const out: Record<string, unknown> = {}

await page.goto(`${BASE}/static.html`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// --- 1. which elements overflow / escape their Axiom root ---
out.structural = await page.evaluate((ids) => {
  const overflow: unknown[] = [], escape: unknown[] = []
  const desc = (el: Element, root: Element) => ({
    root: root.id,
    tag: el.tagName.toLowerCase(),
    id: (el as HTMLElement).id || null,
    class: String((el as HTMLElement).className || '').slice(0, 60),
    text: (el.textContent ?? '').trim().slice(0, 40),
  })
  for (const id of ids) {
    const root = document.getElementById(id); if (!root) continue
    const box = root.getBoundingClientRect()
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (el.scrollHeight - el.clientHeight > 1) {
        overflow.push({ ...desc(el, root), delta: el.scrollHeight - el.clientHeight, clientH: el.clientHeight, scrollH: el.scrollHeight, overflowY: cs.overflowY, height: cs.height })
      }
      if (r.right > box.right + 1 || r.bottom > box.bottom + 1) {
        escape.push({ ...desc(el, root), beyondRight: Math.round(r.right - box.right), beyondBottom: Math.round(r.bottom - box.bottom), position: cs.position, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], rootRect: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)] })
      }
    }
  }
  return { overflow, escape }
}, ROOT_IDS)

// --- 2. corrected forms check: two fields, async rule ---
async function setField(id: string, value: string) {
  await page.fill(`#${id}`, value)
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i) as HTMLInputElement
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, [id, value] as unknown as [string, string])
}
const formsTrace: Record<string, unknown> = {}
await setField('forms-username-input', 'ada_l')
await setField('forms-email-input', 'no-valido')
await page.waitForTimeout(1600) // 200ms debounce + 300ms async rule + margen
formsTrace.invalidCase = await page.evaluate(() => {
  const root = document.getElementById('forms-demo-root')!
  return {
    invalidCount: root.querySelectorAll('.form-status--invalid').length,
    statuses: Array.from(root.querySelectorAll('.form-status')).map((e) => `${e.className.replace('form-status ', '')}:"${(e.textContent ?? '').trim()}"`),
    code: Array.from(root.querySelectorAll('code')).map((e) => (e.textContent ?? '').trim()),
  }
})
await setField('forms-username-input', 'ada_lovelace')
await setField('forms-email-input', 'dev@axiom.local')
await page.waitForTimeout(1800)
formsTrace.validCase = await page.evaluate(() => {
  const root = document.getElementById('forms-demo-root')!
  return {
    invalidCount: root.querySelectorAll('.form-status--invalid').length,
    validCount: root.querySelectorAll('.form-status--valid').length,
    statuses: Array.from(root.querySelectorAll('.form-status')).map((e) => `${e.className.replace('form-status ', '')}:"${(e.textContent ?? '').trim()}"`),
    code: Array.from(root.querySelectorAll('code')).map((e) => (e.textContent ?? '').trim()),
  }
})
await page.screenshot({ path: `${OUT}/shots/11-forms-valid.png` })
out.forms = formsTrace

// --- 3. 390px: who causes the 14px horizontal overflow ---
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(700)
out.mobile390 = await page.evaluate(() => {
  const de = document.documentElement
  const vw = de.clientWidth
  const wide: unknown[] = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (r.right > vw + 1) {
      wide.push({
        tag: el.tagName.toLowerCase(), id: (el as HTMLElement).id || null,
        class: String((el as HTMLElement).className || '').slice(0, 50),
        right: Math.round(r.right), width: Math.round(r.width), overflowPx: Math.round(r.right - vw),
        position: getComputedStyle(el).position,
      })
    }
  }
  return { viewportWidth: vw, scrollWidth: de.scrollWidth, overflowPx: de.scrollWidth - de.clientWidth, offenders: wide.slice(0, 20), offenderCount: wide.length }
})
await page.screenshot({ path: `${OUT}/shots/12-static-390.png`, fullPage: false })

await browser.close()
await writeFile(`${OUT}/diagnostic.json`, JSON.stringify(out, null, 2))

const s = out.structural as any
console.log('=== OVERFLOW interno (scrollHeight>clientHeight) ===', s.overflow.length)
for (const o of s.overflow) console.log(' ', JSON.stringify(o))
console.log('=== FUGAS fuera del contenedor root ===', s.escape.length)
for (const e of s.escape) console.log(' ', JSON.stringify(e))
console.log('=== FORMS caso invalido ==='); console.log(JSON.stringify(formsTrace.invalidCase, null, 1))
console.log('=== FORMS caso valido ==='); console.log(JSON.stringify(formsTrace.validCase, null, 1))
console.log('=== 390px ==='); const m = out.mobile390 as any
console.log(`viewport=${m.viewportWidth} scrollWidth=${m.scrollWidth} overflow=${m.overflowPx}px ofensores=${m.offenderCount}`)
for (const o of m.offenders.slice(0, 12)) console.log(' ', JSON.stringify(o))
