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

function runArgs(args: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, script, ...args])
  return {
    code: result.exitCode,
    out: result.stdout.toString().replaceAll('\r\n', '\n'),
    err: result.stderr.toString().replaceAll('\r\n', '\n'),
  }
}

function run(reviews: ReviewFixture[], head = HEAD): { code: number; out: string; err: string } {
  return runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', head,
    '--maintainer', 'naml14',
    '--reviews-file', reviewsFile(reviews),
  ])
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

test('rejects a review that is still a draft', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'PENDING', body: 'Reviewed.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('still a draft')
})

test('rejects an unknown review state', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'SOMETHING_ELSE', body: 'Reviewed.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('targets the head commit')
})

test('rejects when the maintainer requested changes', () => {
  const result = run([{ user: { login: 'naml14' }, state: 'CHANGES_REQUESTED', body: 'The gate does not do what it claims.', commit_id: HEAD }])
  expect(result.code).toBe(1)
  expect(result.err).toContain('requested changes')
})

test('requested changes override an otherwise valid written review', () => {
  const result = run(['COMMENTED', 'CHANGES_REQUESTED'].map(state => ({
    user: { login: 'naml14' }, state, body: 'Reviewed.', commit_id: HEAD,
  })))
  expect(result.code).toBe(1)
  expect(result.err).toContain('requested changes')
})

test('rejects a pull request without reviews', () => {
  const result = run([])
  expect(result.code).toBe(1)
  expect(result.err).toContain('no review by naml14')
})

test('rejects a missing reviews file', () => {
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', join(tmpdir(), 'axiom-maintainer-review-missing.json'),
  ])
  expect(result.code).toBe(1)
  expect(result.err).toContain('reviews file not found')
})

test('rejects a malformed reviews file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-maintainer-review-'))
  dirs.push(dir)
  const path = join(dir, 'reviews.json')
  writeFileSync(path, '{ not json')
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', path,
  ])
  expect(result.code).toBe(1)
  expect(result.err).toContain('not valid JSON')
})

test('refuses to publish a verdict read from a fixture', () => {
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', reviewsFile([{ user: { login: 'naml14' }, state: 'COMMENTED', body: 'Invented.', commit_id: HEAD }]),
    '--publish',
  ])
  expect(result.code).toBe(1)
  expect(result.err).toContain('--publish forbids')
  expect(result.out).not.toContain('published')
})

test('refuses to publish with an overridden head or maintainer', () => {
  const head = runArgs(['--pr', '1', '--repo', 'naml14/axiom-framework', '--head', HEAD, '--publish'])
  expect(head.code).toBe(1)
  expect(head.err).toContain('--publish forbids')

  const maintainer = runArgs(['--pr', '1', '--repo', 'naml14/axiom-framework', '--maintainer', 'someone-else', '--publish'])
  expect(maintainer.code).toBe(1)
  expect(maintainer.err).toContain('--publish forbids')
})

test('dry run reports the status it would publish without publishing it', () => {
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', reviewsFile([{ user: { login: 'naml14' }, state: 'COMMENTED', body: 'Reviewed.', commit_id: HEAD }]),
    '--dry-run',
  ])
  expect(result.code).toBe(0)
  expect(result.out).toContain('state=success')
  expect(result.out).toContain('context=Maintainer review')
  expect(result.out).toContain(HEAD)
  expect(result.out).not.toContain('published')
})

test('dry run reports a failure status when no written review exists', () => {
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', reviewsFile([]),
    '--dry-run',
  ])
  expect(result.code).toBe(1)
  expect(result.out).toContain('state=failure')
})

test('an unreadable input reports a failure status instead of exiting silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-maintainer-review-'))
  dirs.push(dir)
  const path = join(dir, 'reviews.json')
  writeFileSync(path, '{ not json')
  const result = runArgs([
    '--pr', '1',
    '--repo', 'naml14/axiom-framework',
    '--head', HEAD,
    '--maintainer', 'naml14',
    '--reviews-file', path,
    '--dry-run',
  ])
  expect(result.code).toBe(1)
  expect(result.out).toContain('state=failure')
})

test('reports usage on --help', () => {
  const result = Bun.spawnSync([process.execPath, script, '--help'])
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain('Maintainer review')
})
