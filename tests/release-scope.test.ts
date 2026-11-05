import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
function run(dir: string, args: string[], scopeEnv?: Record<string, string>) {
  const before = git(dir, 'status', '--porcelain=v1') + git(dir, 'rev-parse', 'HEAD')
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const scopeStep = workflow.split("      - name: Check each commit's release scope\n")[1]!
    .split('\n  release-notes:')[0]!.split('        run: |\n')[1]!
    .replace(/^          /gm, '')
    .replace('bun run scripts/validate-release-scope.ts', '"$BUN_EXEC" "$SCOPE_SCRIPT"')
  const r = Bun.spawnSync(scopeEnv ? ['bash', '-e', '-o', 'pipefail', '-c', scopeStep]
    : [process.execPath, script, ...args], {
    cwd: dir,
    env: { ...process.env, BUN_EXEC: process.execPath, SCOPE_SCRIPT: script, ...scopeEnv },
  })
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
test('rejects a hyphenated breaking type outside src', () => {
  const { dir, base } = repo()
  const subject = 'docs-site!: revise the contract'
  const sha = commit(dir, subject, 'contract.md')
  expect(run(dir, ['--base', base])).toEqual({ code: 1, out: '', err: rejection(sha, subject, 'contract.md') })
})
test('accepts hyphenated non-breaking types without treating feat/fix prefixes as bumps', () => {
  const { dir, base } = repo()
  for (const type of ['docs-site', 'feat-site', 'fix-site', 'docs2-site']) {
    commit(dir, `${type}: revise the contract`, 'contract.md')
  }
  expect(run(dir, ['--base', base])).toEqual({ code: 0, out: 'release-scope: OK (4 commits checked)\n', err: '' })
})
test('new branch uses the default-branch merge base, excluding historical non-src features', () => {
  const { dir } = repo()
  commit(dir, 'feat: historical demo application', 'demo.txt')
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(dir, 'switch', '-c', 'release-please--new')
  commit(dir, 'chore(main): release 1.0.2', 'CHANGELOG.md')
  expect(run(dir, [], {
    SCOPE_BASE: '0'.repeat(40), SCOPE_HEAD: 'HEAD', SCOPE_DEFAULT_BRANCH: 'main',
  })).toEqual({ code: 0, out: 'release-scope: OK (1 commit checked)\n', err: '' })
})
test('new branch without shared history falls back to its own root', () => {
  const { dir } = repo()
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(dir, 'switch', '--orphan', 'unrelated')
  commit(dir, 'chore: unrelated root', 'unrelated.txt')
  commit(dir, 'docs: unrelated follow-up', 'contract.md')
  expect(run(dir, [], {
    SCOPE_BASE: '0'.repeat(40), SCOPE_HEAD: 'HEAD', SCOPE_DEFAULT_BRANCH: 'main',
  })).toEqual({ code: 0, out: 'release-scope: OK (1 commit checked)\n', err: '' })
})
test('workflow preserves an existing push base instead of scanning default-branch history', () => {
  const { dir, base } = repo()
  git(dir, 'update-ref', 'refs/remotes/origin/main', base)
  const before = commit(dir, 'feat: already checked demo', 'demo.txt')
  commit(dir, 'docs: current push', 'contract.md')
  expect(run(dir, [], {
    SCOPE_BASE: before, SCOPE_HEAD: 'HEAD', SCOPE_DEFAULT_BRANCH: 'main',
  })).toEqual({ code: 0, out: 'release-scope: OK (1 commit checked)\n', err: '' })
})
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
