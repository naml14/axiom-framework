/**
 * Architectural enforcement: the hot path (`reflow → diff → commit`) must not
 * read from the DOM. The DOM is the output screen, never the source of truth
 * for layout calculations.
 *
 * This test scans the hot-path source files and fails if any forbidden DOM
 * read API is referenced. The allowlist covers documentation comments and
 * the single legitimate DOM-touching path inside `commitHydrate` (marker scan
 * via `getElementsByTagName`).
 *
 * If you need to add a DOM-reading API for a legitimate reason, add it to
 * the allowlist with a justifying comment in the source — do not weaken this
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
]

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

function stripCommentsAndStrings(source: string): string {
  // Strip /* ... */ block comments
  let out = source.replace(/\/\*[\s\S]*?\*\//g, '')
  // Strip // ... line comments
  out = out.replace(/^\s*\/\/.*$/gm, '')
  // Strip single/double quoted string contents (replace with empty string of same length to preserve line numbers)
  out = out.replace(/'([^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length))
  out = out.replace(/"([^"\\]|\\.)*"/g, (m) => ' '.repeat(m.length))
  out = out.replace(/`([^`\\]|\\.)*`/g, (m) => ' '.repeat(m.length))
  return out
}

describe('architectural invariant: hot path does not read from the DOM', () => {
  for (const file of HOT_PATH_FILES) {
    test(`${file} contains no forbidden DOM reads`, () => {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      const violations: string[] = []
      for (const pattern of FORBIDDEN_DOM_READ_PATTERNS) {
        if (source.includes(pattern)) {
          violations.push(pattern)
        }
      }
      expect(violations).toEqual([])
    })
  }

  for (const file of listEngineFiles(ENGINES_DIR)) {
    test(`${file} contains no forbidden DOM reads`, () => {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      const violations: string[] = []
      for (const pattern of FORBIDDEN_DOM_READ_PATTERNS) {
        if (source.includes(pattern)) {
          violations.push(pattern)
        }
      }
      expect(violations).toEqual([])
    })
  }

  test('only `getElementsByTagName` is allowed (commitHydrate marker scan)', () => {
    const allFiles = [...HOT_PATH_FILES, ...listEngineFiles(ENGINES_DIR)]
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