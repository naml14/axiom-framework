/**
 * Architectural enforcement: the hot path (`prepare → reflow → commit`) must not
 * read from the DOM. The DOM is the output screen, never the source of truth
 * for layout calculations (invariant S4: `prepare -> reflow -> commit` with a
 * hot path free of DOM reads).
 *
 * This test scans the hot-path source files — including `src/app.ts`, which
 * drives every update cycle — and fails if any forbidden DOM read API is
 * referenced without an explicit allowlist marker.
 *
 * Allowlist marker convention: a line containing a DOM-read API is accepted
 * ONLY when it carries an inline comment:
 *
 *   // dom-read-allowlist: <justification>
 *
 * Unmarked reads fail with a message naming file, line and API. Marked reads
 * must additionally be proven not to run per frame — see
 * `tests/architecture/app-steady-state-dom-reads.test.ts` for the behavioral
 * enforcement of `src/app.ts` (mount/resize only, never per update cycle).
 *
 * If you need to add a DOM-reading API for a legitimate reason, add the marker
 * with a truthful justification and a behavioral test — do not weaken this
 * test silently.
 *
 * Hydration demarcation (M-11 / T6): `commitHydrate` in `src/render/commit.ts`
 * is the single documented exception — one-time DOM reads over server-rendered
 * markup, never per frame. `scanSourceForDomReadsWithHydrateDemarcation`
 * skips ONLY that function's body, delimited by function boundary (from
 * `function commitHydrate(` to its matching closing brace) — never by API name
 * and never by whole file. See the JSDoc allowlist on `commitHydrate` itself.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const COMMIT_FILE = 'src/render/commit.ts'

const HOT_PATH_FILES = [
  'src/render/reflow.ts',
  COMMIT_FILE,
  'src/render/diff.ts',
  'src/render/prepare.ts',
  'src/render/pool.ts',
] as const

// `src/app.ts` orchestrates every update cycle (getConstraints feeds reflow),
// so it is part of the enforced surface (C-4 / M-12).
const APP_FILE = 'src/app.ts'

// Layout engines live in their own folder and are also part of the hot path.
const ENGINES_DIR = 'src/render/engines'

const FORBIDDEN_DOM_READ_PATTERNS: ReadonlyArray<string> = [
  'getBoundingClientRect',
  'getComputedStyle',
  'offsetHeight',
  'offsetWidth',
  'clientHeight',
  'clientWidth',
  'scrollHeight',
  'scrollWidth',
  'window.getComputedStyle',
  'window.innerWidth',
  'window.innerHeight',
]

// Inline marker that allowlists a single line containing a DOM-read API.
const ALLOWLIST_MARKER = '// dom-read-allowlist:'

// Allowlist: reads that are legitimate ONLY inside `commitHydrate` (one-time
// hydration of server-rendered markup, M-11 / T6). The demarcated scan skips
// commitHydrate's body by function boundary, and a dedicated test below asserts
// these patterns appear nowhere else in the enforced surface. Any other
// DOM-read must fail the build.
const ALLOWED_PATTERNS: ReadonlyArray<string> = [
  'getElementsByTagName', // commitHydrate marker scan only
]

function listEngineFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listEngineFiles(full))
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/** Blank out a match while preserving newlines, so line numbers stay accurate. */
function blankPreservingLines(match: string): string {
  return match.replace(/[^\n]/g, ' ')
}

function stripCommentsAndStrings(source: string): string {
  // Strip /* ... */ block comments (preserving line structure)
  let out = source.replace(/\/\*[\s\S]*?\*\//g, blankPreservingLines)
  // Strip // ... line comments that occupy the whole line (trailing inline
  // comments — including the allowlist marker — are preserved). Use [ \t]
  // instead of \s so leading blank lines' newlines are not consumed.
  out = out.replace(/^[ \t]*\/\/.*$/gm, '')
  // Strip single/double quoted string contents (preserve length and line numbers)
  out = out.replace(/'([^'\\]|\\.)*'/g, blankPreservingLines)
  out = out.replace(/"([^"\\]|\\.)*"/g, blankPreservingLines)
  out = out.replace(/`([^`\\]|\\.)*`/g, blankPreservingLines)
  return out
}

/**
 * Locate the first `function commitHydrate(...)` declaration and return its
 * 1-based inclusive line span, from the declaration line to the line of its
 * matching closing brace (brace counting; run on comment/string-stripped
 * source so braces inside literals do not confuse it). Returns null when the
 * function is absent — callers then scan everything (fail-safe).
 */
export function findCommitHydrateRegion(code: string): { startLine: number; endLine: number } | null {
  const match = /function\s+commitHydrate\s*\(/.exec(code)
  if (match === null) return null
  const startLine = code.slice(0, match.index).split('\n').length
  let depth = 0
  let started = false
  for (let i = match.index + match[0].length - 1; i < code.length; i++) {
    const ch = code[i]
    if (ch === '{') {
      depth++
      started = true
    } else if (ch === '}') {
      depth--
      if (started && depth === 0) {
        const endLine = code.slice(0, i).split('\n').length
        return { startLine, endLine }
      }
    }
  }
  return null
}

/** Shared line loop over comment/string-stripped source. `isSkipped` receives the 0-based line index. */
function scanStrippedLines(stripped: string, path: string, isSkipped: (index: number) => boolean): string[] {
  const lines = stripped.split('\n')
  const violations: string[] = []

  for (let i = 0; i < lines.length; i++) {
    if (isSkipped(i)) continue
    const line = lines[i]!
    if (line.includes(ALLOWLIST_MARKER)) continue
    for (const pattern of FORBIDDEN_DOM_READ_PATTERNS) {
      if (line.includes(pattern)) {
        violations.push(
          `${path}:${i + 1}: forbidden DOM read \`${pattern}\` without inline marker ` +
            `\`${ALLOWLIST_MARKER} <justification>\``
        )
      }
    }
  }

  return violations
}

/**
 * Pure scanner: given TypeScript source code and the path it came from,
 * return one violation message per line that references a forbidden DOM-read
 * API without the inline `// dom-read-allowlist: <justification>` marker.
 *
 * Violation message format: `<path>:<line>: forbidden DOM read \`<api>\` ...`
 *
 * Exported for unit testing with synthetic sources.
 */
export function scanSourceForDomReads(code: string, path: string): string[] {
  return scanStrippedLines(stripCommentsAndStrings(code), path, () => false)
}

/**
 * Demarcated scanner for `src/render/commit.ts`: identical to
 * `scanSourceForDomReads` except that lines inside `commitHydrate`'s function
 * body are skipped. The demarcation line is the function boundary — from the
 * `function commitHydrate(` declaration to its matching closing brace — so the
 * documented one-time hydration reads (see the JSDoc allowlist on the function)
 * pass, while the same APIs anywhere else in the file still fail.
 */
export function scanSourceForDomReadsWithHydrateDemarcation(code: string, path: string): string[] {
  const stripped = stripCommentsAndStrings(code)
  const region = findCommitHydrateRegion(stripped)
  return scanStrippedLines(stripped, path, (i) => {
    const line = i + 1
    return region !== null && line >= region.startLine && line <= region.endLine
  })
}

describe('architectural invariant: hot path does not read from the DOM', () => {
  for (const file of HOT_PATH_FILES) {
    test(`${file} contains no forbidden DOM reads`, () => {
      const source = readFileSync(file, 'utf8')
      // commit.ts gets the demarcated scan: ONLY commitHydrate's function body
      // (the single documented hydration-only exception, M-11 / T6) is skipped;
      // the rest of the file is scanned exactly like every other hot-path file.
      const violations = file === COMMIT_FILE
        ? scanSourceForDomReadsWithHydrateDemarcation(source, file)
        : scanSourceForDomReads(source, file)
      expect(violations).toEqual([])
    })
  }

  for (const file of listEngineFiles(ENGINES_DIR)) {
    test(`${file} contains no forbidden DOM reads`, () => {
      const violations = scanSourceForDomReads(readFileSync(file, 'utf8'), file)
      expect(violations).toEqual([])
    })
  }

  test(`${APP_FILE} contains no unmarked DOM reads (C-4/M-12)`, () => {
    const violations = scanSourceForDomReads(readFileSync(APP_FILE, 'utf8'), APP_FILE)
    expect(violations).toEqual([])
  })

  test('allowlisted DOM reads appear only inside commitHydrate (narrow allowance)', () => {
    const allFiles = [...HOT_PATH_FILES, APP_FILE, ...listEngineFiles(ENGINES_DIR)]
    const offenders: string[] = []
    for (const file of allFiles) {
      const stripped = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      const region = findCommitHydrateRegion(stripped)
      const lines = stripped.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const insideHydrate = region !== null && i + 1 >= region.startLine && i + 1 <= region.endLine
        if (insideHydrate) continue
        for (const pattern of ALLOWED_PATTERNS) {
          if (new RegExp(`\\b${pattern}\\b`).test(lines[i]!)) {
            offenders.push(`${file}:${i + 1}: \`${pattern}\` outside commitHydrate`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('scanSourceForDomReads (unit)', () => {
  test('reports an unmarked DOM read naming file, line and API', () => {
    const code = [
      'const a = 1',
      'const w = root.clientWidth',
      'const h = window.innerHeight',
    ].join('\n')
    const violations = scanSourceForDomReads(code, 'fake.ts')
    expect(violations.length).toBe(2)
    expect(violations[0]).toContain('fake.ts:2')
    expect(violations[0]).toContain('clientWidth')
    expect(violations[1]).toContain('fake.ts:3')
    expect(violations[1]).toContain('window.innerHeight')
  })

  test('accepts a DOM read carrying the allowlist marker', () => {
    const code = 'const w = root.clientWidth // dom-read-allowlist: mount/resize only'
    expect(scanSourceForDomReads(code, 'fake.ts')).toEqual([])
  })

  test('a marker without a DOM read is clean', () => {
    const code = '// dom-read-allowlist: nothing to justify here\nconst a = 1'
    expect(scanSourceForDomReads(code, 'fake.ts')).toEqual([])
  })

  test('DOM read APIs inside strings or block comments do not count', () => {
    const code = "const s = 'root.clientWidth'\n/* getBoundingClientRect in a block comment */"
    expect(scanSourceForDomReads(code, 'fake.ts')).toEqual([])
  })

  test('line numbers stay accurate across block comments and blank lines', () => {
    const code = [
      '/* a',
      '   multi-line block comment */',
      '',
      '   // full-line comment',
      'const w = root.clientWidth',
    ].join('\n')
    const violations = scanSourceForDomReads(code, 'fake.ts')
    expect(violations.length).toBe(1)
    expect(violations[0]).toContain('fake.ts:5')
  })
})

describe('scanSourceForDomReadsWithHydrateDemarcation (T6/M-11)', () => {
  test('(a) a DOM read inside a commitHydrate-named function passes', () => {
    const code = [
      'export function commitHydrate(root: HTMLElement): number {',
      '  return root.clientHeight',
      '}',
    ].join('\n')
    expect(scanSourceForDomReadsWithHydrateDemarcation(code, 'fake.ts')).toEqual([])
  })

  test('(b) the same read outside commitHydrate in the same file fails', () => {
    const code = [
      'export function commitHydrate(root: HTMLElement): number {',
      '  return root.clientHeight',
      '}',
      'export function other(root: HTMLElement): number {',
      '  return root.clientHeight',
      '}',
    ].join('\n')
    const violations = scanSourceForDomReadsWithHydrateDemarcation(code, 'fake.ts')
    expect(violations.length).toBe(1)
    expect(violations[0]).toContain('fake.ts:5')
    expect(violations[0]).toContain('clientHeight')
  })

  test('reads in nested closures inside commitHydrate stay demarcated', () => {
    const code = [
      'export function commitHydrate(root: HTMLElement): void {',
      '  const visit = (el: HTMLElement) => {',
      '    if (el.getBoundingClientRect().width > 0) { /* nested */ }',
      '  }',
      '  visit(root)',
      '}',
    ].join('\n')
    expect(scanSourceForDomReadsWithHydrateDemarcation(code, 'fake.ts')).toEqual([])
  })

  test('the allowlist marker convention still works outside commitHydrate', () => {
    const code = [
      'export function commitHydrate(root: HTMLElement): number { return 0 }',
      'const w = root.clientWidth // dom-read-allowlist: mount/resize only',
      'const h = root.clientHeight',
    ].join('\n')
    const violations = scanSourceForDomReadsWithHydrateDemarcation(code, 'fake.ts')
    expect(violations.length).toBe(1)
    expect(violations[0]).toContain('fake.ts:3')
  })

  test('a file without commitHydrate is scanned normally', () => {
    const code = 'const w = root.clientWidth'
    const violations = scanSourceForDomReadsWithHydrateDemarcation(code, 'fake.ts')
    expect(violations.length).toBe(1)
    expect(violations[0]).toContain('fake.ts:1')
  })

  test('findCommitHydrateRegion returns null when the function is absent', () => {
    expect(findCommitHydrateRegion('const a = 1')).toBeNull()
  })

  test('(c) real src/render/commit.ts scans clean under the demarcated scan', () => {
    const source = readFileSync(COMMIT_FILE, 'utf8')
    expect(scanSourceForDomReadsWithHydrateDemarcation(source, COMMIT_FILE)).toEqual([])
    // Sanity: the demarcation actually found the function in the real file.
    expect(findCommitHydrateRegion(stripCommentsAndStrings(source))).not.toBeNull()
  })
})
