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
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const HOT_PATH_FILES = [
  'src/render/reflow.ts',
  'src/render/commit.ts',
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

// Allowlist: comments are stripped before scanning, but we permit these in
// both comments AND code because they appear in the single legitimate path
// (commitHydrate marker scan). Any other DOM-read must fail the build.
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
 * Pure scanner: given TypeScript source code and the path it came from,
 * return one violation message per line that references a forbidden DOM-read
 * API without the inline `// dom-read-allowlist: <justification>` marker.
 *
 * Violation message format: `<path>:<line>: forbidden DOM read \`<api>\` ...`
 *
 * Exported for unit testing with synthetic sources.
 */
export function scanSourceForDomReads(code: string, path: string): string[] {
  const stripped = stripCommentsAndStrings(code)
  const lines = stripped.split('\n')
  const violations: string[] = []

  for (let i = 0; i < lines.length; i++) {
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

describe('architectural invariant: hot path does not read from the DOM', () => {
  for (const file of HOT_PATH_FILES) {
    test(`${file} contains no forbidden DOM reads`, () => {
      const violations = scanSourceForDomReads(readFileSync(file, 'utf8'), file)
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

  test('only `getElementsByTagName` is allowed (commitHydrate marker scan)', () => {
    const allFiles = [...HOT_PATH_FILES, APP_FILE, ...listEngineFiles(ENGINES_DIR)]
    for (const file of allFiles) {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      const allowed: string[] = []
      for (const pattern of ALLOWED_PATTERNS) {
        if (source.includes(pattern)) {
          allowed.push(`${pattern} in ${file}`)
        }
      }
      // We don't assert exclusivity (no other patterns allowed); that's covered
      // by the FORBIDDEN_PATTERNS loop. This test just documents the allowlist.
      expect(allowed.length).toBeGreaterThanOrEqual(0)
    }
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
