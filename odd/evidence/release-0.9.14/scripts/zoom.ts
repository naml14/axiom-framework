/**
 * Visual evidence: clip screenshots of the three areas flagged by the
 * structural diagnostic, so a human can judge whether the overflow is cosmetic
 * or a real layout collision.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const OUT = 'E:/trabajo/Axiom/.verify-tmp/evidence/shots'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.goto(`${BASE}/static.html`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const areas = [
  { sel: '#syntax-h-v2-root', name: 'zoom-syntax-h-v2' },
  { sel: '#syntax-h-literal-root', name: 'zoom-syntax-h-literal' },
  { sel: '#ruta-b-grid-root', name: 'zoom-grid-mvp' },
  { sel: '#portal-demo-root', name: 'zoom-portal' },
  { sel: '#router-demo-root', name: 'zoom-router' },
]

for (const a of areas) {
  const handle = await page.$(a.sel)
  if (!handle) { console.log(`MISSING ${a.sel}`); continue }
  await handle.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const box = await handle.boundingBox()
  if (!box) { console.log(`NO BOX ${a.sel}`); continue }
  await page.screenshot({
    path: `${OUT}/${a.name}.png`,
    clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 },
  })
  console.log(`SHOT ${a.name} ${JSON.stringify(box)}`)
}

// router 404 state: navigate to the 404 route so the flagged h2 is visible
const nav404 = await page.$('#router-nav-404')
if (nav404) {
  await nav404.click()
  await page.waitForTimeout(500)
  const handle = await page.$('#router-demo-root')
  const box = await handle?.boundingBox()
  if (box) await page.screenshot({ path: `${OUT}/zoom-router-404.png`, clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 } })
  console.log('SHOT zoom-router-404')
}

await browser.close()
