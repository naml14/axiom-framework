/**
 * Architectural enforcement: text measurement is unified in
 * `src/render/engines/text-measure.ts`. No other file in the render pipeline
 * should redefine `CHAR_WIDTH` or hardcode a `charWidth` value.
 *
 * Historical context: `unify-text-measurement` (OpenSpec change) consolidated
 * the value to `CHAR_WIDTH = 8` with `WORD_WRAP_FACTOR = 1.4`. Earlier paths
 * used a hardcoded `charWidth = 6`, which produced inconsistent text heights
 * depending on the layout path taken (flex/grid/fast-path vs leaf-text root).
 *
 * If you need to change the value, edit `text-measure.ts` — the single source
 * of truth — and let the rest of the framework inherit.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Use forward slashes for cross-platform consistency in the filter below.
const SOURCE_OF_TRUTH = 'src/render/engines/text-measure.ts'

/**
 * Strip block comments, line comments, and string contents so that the scan
 * only matches identifiers used in code, not prose in comments or docs.
 * String contents are replaced with spaces of equal length so that line/column
 * numbers in any violation messages remain meaningful.
 */
function stripCommentsAndStrings(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  out = out.replace(/(^|[^:])\/\/.*$/gm, (m) => ' '.repeat(m.length))
  out = out.replace(/'([^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length))
  out = out.replace(/"([^"\\]|\\.)*"/g, (m) => ' '.repeat(m.length))
  out = out.replace(/`([^`\\]|\\.)*`/g, (m) => ' '.repeat(m.length))
  return out
}

const HOT_PATH_FILES = [
  'src/render/reflow.ts',
  'src/render/commit.ts',
  'src/render/diff.ts',
  'src/render/prepare.ts',
  'src/render/pool.ts',
] as const

const ENGINES_DIR = 'src/render/engines'

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

describe('architectural invariant: text measurement unified in text-measure.ts', () => {
  test('source of truth defines CHAR_WIDTH as 8 with WORD_WRAP_FACTOR = 1.4', () => {
    const source = readFileSync(SOURCE_OF_TRUTH, 'utf8')
    expect(source).toMatch(/const\s+CHAR_WIDTH\s*=\s*8\b/)
    expect(source).toMatch(/const\s+WORD_WRAP_FACTOR\s*=\s*1\.4\b/)
  })

  test('no other render file hardcodes a charWidth value', () => {
    const allFiles = [...HOT_PATH_FILES, ...listEngineFiles(ENGINES_DIR)].filter(
      (f) => f.replace(/\\/g, '/') !== SOURCE_OF_TRUTH
    )

    const violations: Array<{ file: string; line: number; match: string }> = []

    for (const file of allFiles) {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      const lines = source.split('\n')

      // Look for assignments to a local "charWidth" identifier (avoid catching
      // CHAR_WIDTH exports from text-measure.ts). Pattern: `charWidth = <num>`
      // not preceded by an alpha/underscore (i.e. not CHAR_WIDTH or myCharWidth).
      const re = /(?<![A-Za-z0-9_])charWidth\s*=\s*\d+(\.\d+)?\b/

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (re.test(line)) {
          violations.push({ file, line: i + 1, match: line.trim() })
        }
      }
    }

    expect(violations).toEqual([])
  })

  test('CHAR_WIDTH identifier only appears in text-measure.ts', () => {
    const allFiles = [...HOT_PATH_FILES, ...listEngineFiles(ENGINES_DIR)].filter(
      (f) => f.replace(/\\/g, '/') !== SOURCE_OF_TRUTH
    )

    const violations: string[] = []

    for (const file of allFiles) {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      if (/\bCHAR_WIDTH\b/.test(source)) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
  })
})