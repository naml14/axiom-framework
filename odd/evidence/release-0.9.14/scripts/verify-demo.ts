/**
 * Release-candidate verification for PR #118 (axiom-framework 0.9.14).
 *
 * Runs against the demo server of the isolated worktree at the exact PR head
 * (fe0e1be). Evidence: JSON + markdown + screenshots in .verify-tmp/evidence.
 *
 * Nothing here mutates the repository; it only reads HTTP responses and drives
 * a real Chromium instance.
 */
import { chromium, type Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:3000'
const OUT = 'E:/trabajo/Axiom/.verify-tmp/evidence'
await mkdir(OUT, { recursive: true })
await mkdir(`${OUT}/shots`, { recursive: true })

type Check = { id: string; group: string; ok: boolean; detail: string }
const checks: Check[] = []
const add = (group: string, id: string, ok: boolean, detail: string) => {
  checks.push({ group, id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${id} — ${detail}`)
}

// ---------------------------------------------------------------------------
// 1. HTTP layer: routes, headers, CORS, traversal
// ---------------------------------------------------------------------------
const SECURITY_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'content-security-policy',
  'permissions-policy',
]

async function httpProbe(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...init })
  const body = await res.text()
  return { res, body, headers: Object.fromEntries(res.headers.entries()) }
}

const routes = [
  { path: '/', expect: 200, probe: (b: string) => b.includes('demo-launcher') },
  { path: '/static.html', expect: 200, probe: (b: string) => b.includes('context-demo-root') && b.includes('forms-demo-root') },
  { path: '/ssr?name=Dev&width=960&root=ssr-root', expect: 200, probe: (b: string) => b.includes('data-axiom-id') && b.includes('Dev') },
  { path: '/ssr?name=Dev&width=720&root=ssr-root', expect: 200, probe: (b: string) => b.includes('data-axiom-id') },
  { path: '/ssr-stream', expect: 200, probe: (b: string) => b.includes('ssr-stream-root') },
  { path: '/style.css', expect: 200, probe: (b: string) => b.length > 500 },
  { path: '/app.js', expect: 200, probe: (b: string) => b.length > 1000 },
  { path: '/does-not-exist', expect: 404, probe: () => true },
]

for (const r of routes) {
  const { res, body, headers } = await httpProbe(r.path)
  const statusOk = res.status === r.expect
  const contentOk = r.probe(body)
  const missingHeaders = SECURITY_HEADERS.filter((h) => !(h in headers))
  add('http', `GET ${r.path}`, statusOk && contentOk && missingHeaders.length === 0,
    `status=${res.status} (esperado ${r.expect}), bytes=${body.length}, contenido=${contentOk ? 'ok' : 'FALTA'}, headersDeSeguridad=${missingHeaders.length === 0 ? 'todos' : 'faltan ' + missingHeaders.join(',')}`)
}

// streaming really streams?
{
  const { headers } = await httpProbe('/ssr-stream')
  const chunked = (headers['transfer-encoding'] ?? '').includes('chunked')
  add('http', 'GET /ssr-stream es chunked', chunked, `transfer-encoding=${headers['transfer-encoding'] ?? '(ausente)'}`)
}

// CORS preflight: allowed origin vs foreign origin
for (const origin of ['http://localhost:3000', 'http://evil.example']) {
  const { res, headers } = await httpProbe('/ssr', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } })
  const acao = headers['access-control-allow-origin']
  const expected = origin === 'http://localhost:3000'
  const ok = res.status === 204 && (expected ? acao === origin : acao !== origin)
  add('http', `OPTIONS /ssr Origin=${origin}`, ok, `status=${res.status}, access-control-allow-origin=${acao ?? '(ausente)'}`)
}

// path traversal must not escape demo/
for (const evil of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/../.env']) {
  const { res, body } = await httpProbe(evil)
  const leaked = res.status === 200 && (body.includes('"name": "axiom-framework"') || body.includes('devDependencies'))
  add('http', `traversal ${evil}`, !leaked, `status=${res.status}, fuga=${leaked ? 'SI' : 'no'}`)
}

// ---------------------------------------------------------------------------
// 2. Browser: structural invariants + interactions
// ---------------------------------------------------------------------------
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page: Page = await context.newPage()

const consoleMsgs: string[] = []
const pageErrors: string[] = []
const failedReqs: string[] = []
let expectedErrorWindow = false

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 200)}${expectedErrorWindow ? '  [durante paso de error esperado]' : ''}`)
  }
})
page.on('pageerror', (e) => pageErrors.push(`${e.message.slice(0, 200)}${expectedErrorWindow ? '  [durante paso de error esperado]' : ''}`))
page.on('requestfailed', (r) => failedReqs.push(`${r.url()} → ${r.failure()?.errorText}`))

const INVARIANT_SNIPPET = (rootIds: string[]) => {
  const out: Record<string, unknown> = { overflow: [], overlap: [], escape: [] }
  for (const id of rootIds) {
    const root = document.getElementById(id)
    if (!root) { (out as any).missing = [...((out as any).missing ?? []), id]; continue }
    const box = root.getBoundingClientRect()
    const kids = Array.from(root.querySelectorAll('*'))
    for (const el of kids) {
      const r = el.getBoundingClientRect()
      if (el.scrollHeight - el.clientHeight > 1) (out.overflow as any[]).push([id, el.tagName, String(el.className).slice(0, 30), el.scrollHeight - el.clientHeight])
      if (r.right > box.right + 1 || r.bottom > box.bottom + 1) (out.escape as any[]).push([id, el.tagName, String(el.className).slice(0, 30), Math.round(Math.max(r.right - box.right, r.bottom - box.bottom))])
    }
    const siblings = Array.from(root.children)
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i].getBoundingClientRect(), b = siblings[j].getBoundingClientRect()
        if (a.width === 0 || b.width === 0) continue
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (ox > 1 && oy > 1) (out.overlap as any[]).push([id, siblings[i].tagName, siblings[j].tagName, Math.round(ox), Math.round(oy)])
      }
    }
  }
  const de = document.documentElement
  ;(out as any).docHorizontalOverflow = de.scrollWidth - de.clientWidth
  return out
}

const ROOT_IDS = [
  'context-demo-root', 'forms-demo-root', 'router-demo-root', 'portal-demo-root',
  'ruta-b-grid-root', 'syntax-flow-root', 'syntax-jsx-root', 'syntax-layout-root',
  'syntax-h-v2-root', 'syntax-h-literal-root', 'syntax-events-root',
]

function summarizeInvariants(inv: any, label: string) {
  const bad = inv.overflow.length + inv.overlap.length + inv.escape.length
  const docOv = inv.docHorizontalOverflow ?? 0
  add('estructura', label, bad === 0 && docOv <= 1 && !(inv.missing ?? []).length,
    `overflow=${inv.overflow.length}, solapamientos=${inv.overlap.length}, fugas=${inv.escape.length}, overflowHorizontalDoc=${docOv}${inv.missing ? ', rootsAusentes=' + inv.missing.join('/') : ''}`)
}

// --- /static.html ---
await page.goto(`${BASE}/static.html`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const mountedRoots = await page.evaluate((ids) => ids.filter((id) => {
  const el = document.getElementById(id); return !!el && el.children.length > 0
}), ROOT_IDS)
add('estructura', 'roots Axiom montados en /static.html', mountedRoots.length >= 8,
  `${mountedRoots.length}/${ROOT_IDS.length} con hijos: ${mountedRoots.join(', ')}`)
summarizeInvariants(await page.evaluate(INVARIANT_SNIPPET, ROOT_IDS) as any, 'invariantes iniciales /static.html')
await page.screenshot({ path: `${OUT}/shots/01-static-full.png`, fullPage: true })

// counters row inside the sidebar (regression from demo-ui-polish)
{
  const rows = await page.evaluate(() => {
    const res: any[] = []
    for (const id of ['context-demo-root', 'forms-demo-root']) {
      const root = document.getElementById(id); if (!root) continue
      const groups = new Map<number, number>()
      for (const b of root.querySelectorAll('button')) {
        const r = b.getBoundingClientRect()
        const key = Math.round(r.top)
        groups.set(key, (groups.get(key) ?? 0) + 1)
      }
      res.push({ id, buttonsPerRow: [...groups.values()], total: root.querySelectorAll('button').length })
    }
    return res
  })
  const ok = rows.every((r) => r.buttonsPerRow.every((n) => n <= 3)) && rows.length > 0
  add('estructura', 'botones de contador en filas de <=3', ok, JSON.stringify(rows))
}

// --- interactions: every button ---
const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button[id]')).map((b) => ({
  id: b.id, text: (b.textContent ?? '').trim().slice(0, 30),
})))
const EXPECTED_ERROR_BUTTONS = new Set(['dx-error-test', 'ruta-b-error-run'])
const errorOutputs: Record<string, string> = { 'dx-error-test': 'dx-error-output', 'ruta-b-error-run': 'ruta-b-error-output' }
let clicked = 0, clickFailures: string[] = []

for (const b of buttons) {
  const before = await page.evaluate(() => document.body.innerHTML.length)
  const isExpectedError = EXPECTED_ERROR_BUTTONS.has(b.id)
  const outId = errorOutputs[b.id]
  const outBefore = outId ? await page.evaluate((id) => document.getElementById(id)?.textContent ?? '', outId) : ''
  const errBefore = pageErrors.length + consoleMsgs.filter((m) => !m.includes('esperado')).length
  expectedErrorWindow = isExpectedError
  try {
    await page.click(`#${b.id}`, { timeout: 3000 })
    await page.waitForTimeout(220)
    clicked++
    if (isExpectedError && outId) {
      const outAfter = await page.evaluate((id) => document.getElementById(id)?.textContent ?? '', outId)
      if (outAfter === outBefore) clickFailures.push(`${b.id}: el sobre de error no registro nada`)
    }
    const errAfter = pageErrors.length + consoleMsgs.filter((m) => !m.includes('esperado')).length
    if (!isExpectedError && errAfter > errBefore) clickFailures.push(`${b.id}: ${errAfter - errBefore} error(es) nuevo(s) en consola`)
    const after = await page.evaluate(() => document.body.innerHTML.length)
    if (after === before && !isExpectedError) clickFailures.push(`${b.id}: sin efecto observable en el DOM`)
  } catch (e) {
    clickFailures.push(`${b.id}: ${(e as Error).message.slice(0, 90)}`)
  } finally {
    expectedErrorWindow = false
  }
}
add('interaccion', `click en ${buttons.length} botones`, clickFailures.length === 0,
  `clickeados=${clicked}, fallos=${clickFailures.length}${clickFailures.length ? ' → ' + clickFailures.slice(0, 6).join(' | ') : ''}`)
summarizeInvariants(await page.evaluate(INVARIANT_SNIPPET, ROOT_IDS) as any, 'invariantes tras todos los clicks')
await page.screenshot({ path: `${OUT}/shots/02-static-after-clicks.png`, fullPage: true })

// --- sliders ---
for (const [slider, display, values] of [
  ['width-slider', 'width-display', ['320', '800', '1400']],
  ['items-slider', 'items-display', ['5', '20', '60']],
] as const) {
  const seen: string[] = []
  for (const v of values) {
    await page.evaluate(([s, val]) => {
      const el = document.getElementById(s) as HTMLInputElement
      el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, [slider, v] as unknown as [string, string])
    await page.waitForTimeout(350)
    seen.push(await page.evaluate((id) => document.getElementById(id)?.textContent ?? '', display))
  }
  const distinct = new Set(seen).size
  add('interaccion', `slider #${slider} reactivo`, distinct === values.length, `valores leidos en #${display}: ${seen.join(' / ')}`)
}
summarizeInvariants(await page.evaluate(INVARIANT_SNIPPET, ROOT_IDS) as any, 'invariantes tras sliders al maximo')
await page.screenshot({ path: `${OUT}/shots/03-static-sliders-max.png`, fullPage: true })

// --- router navigation ---
{
  const navIds = ['router-nav-home', 'router-nav-about', 'router-nav-users', 'router-nav-user-2', 'router-nav-404', 'router-nav-back', 'router-nav-forward', 'router-nav-replace']
  const outputs: string[] = []
  for (const id of navIds) {
    const btn = await page.$(`#${id}`)
    if (!btn) { outputs.push(`${id}:NO-EXISTE`); continue }
    await btn.click()
    await page.waitForTimeout(250)
    outputs.push(`${id}=${(await page.evaluate(() => document.getElementById('router-output')?.textContent ?? '')).trim().slice(0, 40)}`)
  }
  const distinct = new Set(outputs.map((o) => o.split('=').slice(1).join('='))).size
  add('interaccion', 'router demo navega', distinct >= 4 && !outputs.some((o) => o.includes('NO-EXISTE')), `${distinct} salidas distintas: ${outputs.join(' | ').slice(0, 300)}`)
}

// --- portal ---
{
  const openBtn = await page.evaluate(() => {
    const root = document.getElementById('portal-demo-root')
    const b = root?.querySelector('button'); return b ? (b as HTMLElement).innerText.slice(0, 30) : null
  })
  if (!openBtn) add('interaccion', 'portal abre y cierra', false, 'no hay boton dentro de #portal-demo-root')
  else {
    await page.click('#portal-demo-root button')
    await page.waitForTimeout(400)
    const open = await page.evaluate(() => {
      const host = document.getElementById('portal-modal-root')
      const modal = host?.querySelector('.portal-modal')
      if (!modal || !host) return { ok: false, why: 'modal o host ausente' }
      const inside = host.contains(modal)
      const r = modal.getBoundingClientRect()
      return { ok: inside && r.width > 50 && r.height > 50, why: `host=#portal-modal-root, dentro=${inside}, ${Math.round(r.width)}x${Math.round(r.height)}` }
    })
    await page.screenshot({ path: `${OUT}/shots/04-portal-open.png` })
    const closed = await page.evaluate(() => {
      const btn = document.querySelector('.portal-close-btn') as HTMLElement | null
      btn?.click(); return !!btn
    })
    await page.waitForTimeout(400)
    const gone = await page.evaluate(() => !document.querySelector('#portal-modal-root .portal-modal'))
    add('interaccion', 'portal abre y cierra', open.ok && closed && gone, `${open.why}; botonCerrar=${closed}; modalDesmontado=${gone}`)
  }
}

// --- forms ---
{
  const inputs = await page.evaluate(() => {
    const root = document.getElementById('forms-demo-root')
    return Array.from(root?.querySelectorAll('input,textarea,select') ?? []).map((el: any) => ({
      tag: el.tagName.toLowerCase(), type: el.type ?? '', id: el.id ?? '', name: el.name ?? '', ph: el.placeholder ?? '',
    }))
  })
  const email = inputs.find((i) => i.type === 'email' || /email/i.test(i.ph + i.name + i.id))
  if (!email) add('interaccion', 'formulario valida email', false, `campos: ${JSON.stringify(inputs).slice(0, 200)}`)
  else {
    const sel = email.id ? `#${email.id}` : `#forms-demo-root ${email.tag}[placeholder="${email.ph}"]`
    await page.fill(sel, 'no-es-un-email')
    await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement; el?.dispatchEvent(new Event('input', { bubbles: true })); el?.dispatchEvent(new Event('change', { bubbles: true })) }, sel)
    await page.waitForTimeout(300)
    const invalidState = await page.evaluate(() => document.querySelector('#forms-demo-root .form-status--invalid') !== null || /invalid/i.test(document.getElementById('forms-demo-root')?.textContent ?? ''))
    await page.fill(sel, 'dev@axiom.local')
    await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement; el?.dispatchEvent(new Event('input', { bubbles: true })); el?.dispatchEvent(new Event('change', { bubbles: true })) }, sel)
    await page.waitForTimeout(300)
    const validState = await page.evaluate(() => document.querySelector('#forms-demo-root .form-status--invalid') === null)
    const submit = await page.$('#forms-demo-root button')
    if (submit) { await submit.click(); await page.waitForTimeout(300) }
    add('interaccion', 'formulario: invalido detectado y valido aceptado', invalidState && validState, `invalidoDetectado=${invalidState}, sinEstadoInvalidoTrasCorreoValido=${validState}, campos=${inputs.length}`)
    await page.screenshot({ path: `${OUT}/shots/05-forms.png` })
  }
}

// --- viewport responsiveness ---
for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  await page.setViewportSize(vp)
  await page.waitForTimeout(500)
  const inv = await page.evaluate(INVARIANT_SNIPPET, ROOT_IDS) as any
  const docOv = inv.docHorizontalOverflow ?? 0
  add('responsive', `/static.html a ${vp.width}px sin overflow horizontal`, docOv <= 1, `scrollWidth-clientWidth=${docOv}, fugas=${inv.escape.length}`)
  await page.screenshot({ path: `${OUT}/shots/06-static-${vp.width}.png`, fullPage: vp.width < 800 })
}
await page.setViewportSize({ width: 1440, height: 900 })

// --- launcher page ---
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
{
  const links = await page.evaluate(() => ['launcher-ssr-link', 'launcher-stream-link'].map((id) => {
    const a = document.getElementById(id) as HTMLAnchorElement | null
    return a ? `${id}=${a.getAttribute('href')}` : `${id}=AUSENTE`
  }))
  add('launcher', 'links del launcher presentes', links.every((l) => !l.includes('AUSENTE')), links.join(' | '))
  await page.screenshot({ path: `${OUT}/shots/07-launcher.png`, fullPage: true })
  await page.click('#launcher-ssr-link')
  await page.waitForTimeout(800)
  add('launcher', 'click en #launcher-ssr-link navega a /ssr', page.url().includes('/ssr'), `url final=${page.url()}`)
}

// --- SSR layout invariants ---
async function ssrInvariants(url: string, shellSel: string, chipSel: string, shotName: string, label: string) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const m = await page.evaluate(([shell, chip]) => {
    const el = document.querySelector(shell) as HTMLElement | null
    if (!el) return { missing: true } as any
    const cs = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const kids = Array.from(el.children)
    const first = kids[0]?.getBoundingClientRect()
    const last = kids[kids.length - 1]?.getBoundingClientRect()
    const parent = el.parentElement!.getBoundingClientRect()
    const chipEl = document.querySelector(chip) as HTMLElement | null
    const chipCs = chipEl ? getComputedStyle(chipEl) : null
    return {
      missing: false,
      padding: cs.padding,
      topGap: first ? Math.round(first.top - box.top) : -1,
      bottomGap: last ? Math.round(box.bottom - last.bottom) : -1,
      leftMargin: Math.round(box.left - parent.left),
      rightMargin: Math.round(parent.right - box.right),
      children: kids.length,
      markers: document.querySelectorAll('[data-axiom-id]').length,
      chipPadding: chipCs ? `${chipCs.paddingTop} ${chipCs.paddingRight} ${chipCs.paddingBottom} ${chipCs.paddingLeft}` : '(chip ausente)',
      h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 60),
    }
  }, [shellSel, chipSel] as unknown as [string, string])
  if (m.missing) { add('ssr', `${label}: shell presente`, false, `${shellSel} no existe en ${url}`); return }
  const centered = Math.abs(m.leftMargin - m.rightMargin) <= 2
  const ok = m.padding === '24px' && m.topGap >= 20 && m.bottomGap >= 20 && centered && m.markers > 0
  add('ssr', `${label}: padding 24px, separaciones >=20px, centrado, marcadores de hidratacion`, ok,
    `padding=${m.padding}, gapArriba=${m.topGap}px, gapAbajo=${m.bottomGap}px, margenes=${m.leftMargin}/${m.rightMargin}, hijos=${m.children}, data-axiom-id=${m.markers}, chip=${m.chipPadding}, h1="${m.h1}"`)
  await page.screenshot({ path: `${OUT}/shots/${shotName}.png`, fullPage: true })
}

await ssrInvariants('/ssr?name=Dev&width=960&root=ssr-root', '.ssr-shell', '.ssr-chip', '08-ssr-960', '/ssr width=960')
await ssrInvariants('/ssr?name=Dev&width=720&root=ssr-root', '.ssr-shell', '.ssr-chip', '09-ssr-720', '/ssr width=720')
await ssrInvariants('/ssr-stream', '.ssr-stream-shell', '.ssr-stream-chip', '10-ssr-stream', '/ssr-stream')

// SSR with a hostile name (XSS attempt must be escaped)
{
  const evil = '/ssr?name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&width=960&root=ssr-root'
  const { res, body } = await httpProbe(evil)
  const injected = body.includes('<img src=x onerror=alert(1)>')
  add('ssr', 'SSR escapa un nombre hostil (XSS)', res.status === 200 && !injected,
    `status=${res.status}, htmlSinEscapar=${injected ? 'SI (VULNERABLE)' : 'no'}, aparece escapado=${body.includes('&lt;img')}`)
  await page.goto(BASE + evil, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const imgs = await page.evaluate(() => document.querySelectorAll('#ssr-root img').length)
  add('ssr', 'SSR hostil no inyecta nodos', imgs === 0, `imagenes inyectadas en #ssr-root=${imgs}`)
}

// ---------------------------------------------------------------------------
// 3. Console / network hygiene
// ---------------------------------------------------------------------------
const unexpectedConsole = consoleMsgs.filter((m) => !m.includes('esperado') && !/favicon/i.test(m))
add('higiene', 'sin errores de pagina', pageErrors.filter((e) => !e.includes('esperado')).length === 0,
  `pageErrors=${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.slice(0, 4).join(' | ') : ''}`)
add('higiene', 'sin errores/avisos inesperados en consola', unexpectedConsole.length === 0,
  `mensajes=${consoleMsgs.length}, inesperados=${unexpectedConsole.length}${unexpectedConsole.length ? ' → ' + unexpectedConsole.slice(0, 5).join(' | ') : ''}`)
const realFailures = failedReqs.filter((f) => !/favicon/i.test(f))
add('higiene', 'sin peticiones fallidas', realFailures.length === 0,
  `fallidas=${failedReqs.length}${realFailures.length ? ' → ' + realFailures.slice(0, 5).join(' | ') : ''} (favicon 404 preexistente ignorado)`)

await browser.close()

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
const pass = checks.filter((c) => c.ok).length
const fail = checks.filter((c) => !c.ok)
const summary = {
  candidate: 'PR #118 — axiom-framework 0.9.14 (head fe0e1be)',
  when: new Date().toISOString(),
  base: BASE,
  totals: { checks: checks.length, pass, fail: fail.length },
  failures: fail,
  consoleMessages: consoleMsgs,
  pageErrors,
  failedRequests: failedReqs,
  checks,
}
await writeFile(`${OUT}/report.json`, JSON.stringify(summary, null, 2))

let md = `# Evidencia de navegador — PR #118 (0.9.14, head fe0e1be)\n\n`
md += `- Fecha: ${summary.when}\n- Demo: ${BASE} (servidor del worktree aislado)\n- Checks: **${pass}/${checks.length} PASS**, ${fail.length} FAIL\n\n`
md += `| Grupo | Check | Resultado | Detalle |\n| --- | --- | --- | --- |\n`
for (const c of checks) md += `| ${c.group} | ${c.id} | ${c.ok ? '✅' : '❌'} | ${c.detail.replace(/\|/g, '\\|')} |\n`
md += `\n## Consola y red\n\n- pageErrors: ${pageErrors.length}\n- consola (error/warning): ${consoleMsgs.length}\n- peticiones fallidas: ${failedReqs.length}\n`
if (consoleMsgs.length) md += `\n\`\`\`\n${consoleMsgs.slice(0, 40).join('\n')}\n\`\`\`\n`
await writeFile(`${OUT}/report.md`, md)

console.log(`\n=== RESUMEN: ${pass}/${checks.length} PASS, ${fail.length} FAIL ===`)
for (const f of fail) console.log(`FAIL → [${f.group}] ${f.id}: ${f.detail}`)
console.log(`Evidencia en ${OUT}`)
