import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/validate-release-scope.ts', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))
function git(dir: string, ...args: string[]) {
  const r = Bun.spawnSync(['git', '-c', 'user.name=Scope Test', '-c', 'user.email=scope@example.com',
    '-c', 'commit.gpgsign=false', ...args], { cwd: dir })
  if (r.exitCode) throw new Error(r.stderr.toString())
  return r.stdout.toString().trim()
}
function commit(dir: string, message: string, path: string) {
  writeFileSync(join(dir, path), `${message}\n`)
  git(dir, 'add', '--', path)
  git(dir, 'commit', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-scope-'))
  dirs.push(dir)
  git(dir, 'init', '-b', 'main')
  mkdirSync(join(dir, 'src'))
  const base = commit(dir, 'chore: initial', 'README.md')
  return { dir, base }
}
function run(dir: string, args: string[]) {
  const before = git(dir, 'status', '--porcelain=v1') + git(dir, 'rev-parse', 'HEAD')
  const r = Bun.spawnSync([process.execPath, script, ...args], { cwd: dir })
  expect(git(dir, 'status', '--porcelain=v1') + git(dir, 'rev-parse', 'HEAD')).toBe(before)
  return { code: r.exitCode, out: r.stdout.toString().replaceAll('\r\n', '\n'),
    err: r.stderr.toString().replaceAll('\r\n', '\n') }
}
const rejection = (sha: string, subject: string, path: string) =>
  `release-scope: rejected ${sha} ${subject}\nFiles: ${path}\nUse chore:, docs:, test: or ci: for changes outside src/.\n`

for (const message of ['fix(demo): update', 'feat(demo): update', 'chore(demo)!: update',
  'docs: update\n\nBREAKING CHANGE: removed contract']) {
  test(`rejects each release-causing non-src commit: ${message.split('\n')[0]}`, () => {
    const { dir, base } = repo()
    const sha = commit(dir, message, 'demo.txt')
    const result = run(dir, ['--base', base, '--head', 'HEAD'])
    expect(result).toEqual({ code: 1, out: '', err: rejection(sha, message.split('\n')[0]!, 'demo.txt') })
  })
}
for (const [message, path] of [['feat(src): add', 'src/main.ts'], ['chore(demo): update', 'demo.txt'],
  ['docs(odd): update', 'plan.md'], ['chore(main): release 1.0.2', 'CHANGELOG.md']]) {
  test(`accepts ${message}`, () => {
    const { dir, base } = repo()
    commit(dir, message!, path!)
    expect(run(dir, ['--base', base])).toEqual({ code: 0, out: 'release-scope: OK (1 commit checked)\n', err: '' })
  })
}
test('mixed PR still rejects isolated demo fix even when another commit touches src', () => {
  const { dir, base } = repo()
  const sha = commit(dir, 'fix(demo): update', 'demo.txt')
  commit(dir, 'feat(src): add', 'src/main.ts')
  expect(run(dir, ['--base', base])).toEqual({ code: 1, out: '', err: rejection(sha, 'fix(demo): update', 'demo.txt') })
})
test('merge traversal checks interior commits instead of the aggregate diff', () => {
  const { dir, base } = repo()
  git(dir, 'checkout', '-b', 'demo-branch')
  const sha = commit(dir, 'fix(demo): update', 'demo.txt')
  git(dir, 'checkout', 'main')
  commit(dir, 'feat(src): add', 'src/main.ts')
  git(dir, 'merge', '--no-ff', 'demo-branch', '-m', 'Merge demo')
  expect(run(dir, ['--base', base])).toEqual({ code: 1, out: '', err: rejection(sha, 'fix(demo): update', 'demo.txt') })
})
test('empty range is accepted and invalid arguments/ranges fail without writes', () => {
  const { dir, base } = repo()
  expect(run(dir, ['--base', base])).toEqual({ code: 0, out: 'release-scope: OK (0 commits checked)\n', err: '' })
  expect(run(dir, [])).toEqual({ code: 1, out: '', err: 'release-scope: --base is required\n' })
  expect(run(dir, ['--base'])).toEqual({ code: 1, out: '', err: 'release-scope: --base requires a value\n' })
  expect(run(dir, ['--unknown'])).toEqual({ code: 1, out: '', err: 'release-scope: unknown argument: --unknown\n' })
  const r = run(dir, ['--base', 'missing-ref'])
  expect(r.code).toBe(1)
  expect(r.out).toBe('')
  expect(r.err).toBe('release-scope: cannot resolve commit: missing-ref\n')
  expect(run(dir, ['--base', base, '--base', base])).toEqual({ code: 1, out: '', err: 'release-scope: duplicate argument: --base\n' })
  const head = commit(dir, 'chore: second', 'second.txt')
  expect(run(dir, ['--base', head, '--head', base])).toEqual({ code: 1, out: '', err: 'release-scope: base must be an ancestor of head\n' })
})
test('help documents the required range, read-only operation and exit codes', () => {
  const { dir } = repo()
  expect(run(dir, ['--help'])).toEqual({ code: 0, err: '', out:
    'Usage: bun run scripts/validate-release-scope.ts --base <ref> [--head <ref>]\n\nRejects each non-merge feat, fix, or breaking commit without src/ changes.\nDefaults: --head HEAD. Exit codes: 0 = clean, 1 = rejected or invalid input.\nRead-only; requires full Git history. See docs/RELEASE_SCOPE.md.\n' })
})
