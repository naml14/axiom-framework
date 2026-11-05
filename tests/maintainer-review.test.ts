import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/validate-maintainer-review.ts', import.meta.url))
const dirs: string[] = []

const HEAD = 'a'.repeat(40)
const OLDER = 'b'.repeat(40)

afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface ReviewFixture {
  user: { login: string }
  state: string
  body: string
  commit_id: string | null
}

/** Writes a reviews payload to a temporary file and returns its path. */
function reviewsFile(reviews: ReviewFixture[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-maintainer-review-'))
  dirs.push(dir)
  const path = join(dir, 'reviews.json')
  writeFileSync(path, JSON.stringify(reviews))
  return path
}

function run(reviews: ReviewFixture[], head = HEAD): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([
    process.execPath, script,
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', head,
    '--maintainer', 'naml14',
    '--reviews-file', reviewsFile(reviews),
  ])
  return {
    code: result.exitCode,
    out: result.stdout.toString().replaceAll('\r\n', '\n'),
    err: result.stderr.toString().replaceAll('\r\n', '\n'),
  }
}

test('accepts a written review by the maintainer on the head commit', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'COMMENTED', body: 'Reviewed the diff and the checks.', commit_id: HEAD }])
  expect(result.code).toBe(0)
  expect(result.out).toContain('maintainer-review-guard: OK')
})

test('accepts an approving review that carries a body', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'APPROVED', body: 'Approved after reading the diff.', commit_id: HEAD }])
  expect(result.code).toBe(0)
  expect(result.out).toContain('maintainer-review-guard: OK')
})

test('rejects a review without a written body', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'COMMENTED', body: '   ', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('carry no written body')
})

test('rejects a review written by someone else', () => {
  const result = run([{ user: { login: 'sourcery-ai[bot]' }, state: 'COMMENTED', body: 'Found three problems.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('no review by naml14')
})

test('rejects a review that targets an earlier commit', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'COMMENTED', body: 'Reviewed the previous push.', commit_id: OLDER }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('targets the head commit')
})

test('rejects a dismissed review', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'DISMISSED', body: 'Reviewed the previous push.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('dismissed')
})

test('rejects when the maintainer requested changes', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'CHANGES_REQUESTED', body: 'The gate does not do what it claims.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('requested changes')
})

test('rejects a pull request without reviews', () => {
  const result = run([])
  expect(result.code).toBe(1)
  expect(result.err).toContain('no review by naml14')
})

test('reports usage on --help', () => {
  const result = Bun.spawnSync([process.execPath, script, '--help'])
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain('Maintainer review')
})
