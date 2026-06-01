/**
 * Phase 3 alignment tests — README onboarding & portal-demo.ts idiomatic style
 *
 * These are source-content tests. They verify that:
 * 1. README guides users to edit `src/app.ts` first after scaffolding.
 * 2. README points to the portal demo as the advanced example.
 * 3. demo/portal-demo.ts uses helper APIs (h, stack) instead of raw VNode literals.
 * 4. demo/portal-demo.ts preserves the dedicated portal root pattern.
 */

import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------

describe('README — onboarding guidance', () => {
  let readme: string

  test('setup: README is readable', async () => {
    readme = await readFile(join(repoRoot, 'README.md'), 'utf-8')
    expect(readme.length).toBeGreaterThan(100)
  })

  test('README tells users to edit src/app.ts first after scaffolding', async () => {
    const content = await readFile(join(repoRoot, 'README.md'), 'utf-8')
    // Must mention src/app.ts as the first edit target
    expect(content).toContain('src/app.ts')
  })

  test('README explains that create-axiom scaffolds an interactive starter', async () => {
    const content = await readFile(join(repoRoot, 'README.md'), 'utf-8')
    // create-axiom command must still be present
    expect(content).toContain('create-axiom')
    // Must convey "starter" concept
    expect(content.toLowerCase()).toMatch(/starter|scaffold/)
  })

  test('README Quick Start points to the portal demo as the advanced example', async () => {
    const content = await readFile(join(repoRoot, 'README.md'), 'utf-8')
    // Must reference portal-demo somewhere
    expect(content).toMatch(/portal[\s-]demo|portal demo/i)
  })
})

// ---------------------------------------------------------------------------
// demo/portal-demo.ts — idiomatic helper API
// ---------------------------------------------------------------------------

describe('demo/portal-demo.ts — idiomatic style', () => {
  let source: string

  test('setup: portal-demo.ts is readable', async () => {
    source = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    expect(source.length).toBeGreaterThan(50)
  })

  test('portal-demo uses h() helper instead of raw VNode literals', async () => {
    const content = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    // Must import and use h()
    expect(content).toContain('h(')
    // Must NOT use the raw { type: 'element' as const, ... } pattern extensively
    // One allowed exception: fragment shorthand in the ModalPortal guard
    const rawLiteralMatches = content.match(/type:\s*'element'\s+as\s+const/g) ?? []
    expect(rawLiteralMatches.length).toBe(0)
  })

  test('portal-demo uses stack() or row() layout helpers', async () => {
    const content = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    expect(content).toMatch(/stack\(|row\(/)
  })

  test('portal-demo preserves the dedicated portal root pattern', async () => {
    const content = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    expect(content).toContain('portal-modal-root')
    expect(content).toContain('getOrCreateModalRoot')
    expect(content).toContain('createPortal')
  })

  test('portal-demo still exports initPortalDemo', async () => {
    const content = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    expect(content).toContain('export function initPortalDemo')
  })

  test('portal-demo imports h from axiom index', async () => {
    const content = await readFile(join(repoRoot, 'demo', 'portal-demo.ts'), 'utf-8')
    expect(content).toMatch(/import\s*\{[^}]*\bh\b[^}]*\}\s*from/)
  })
})
