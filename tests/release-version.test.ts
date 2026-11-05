import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/validate-release-version.ts', import.meta.url))
const dirs: string[] = []

afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function git(dir: string, ...args: string[]): void {
  const result = Bun.spawnSync([
    'git', '-c', 'user.name=Release Test', '-c', 'user.email=release@example.com',
    '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: dir })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
}

interface Fixture {
  dir: string
  version: string
}

/** Builds a repository whose package.json, manifest, CHANGELOG and tag agree. */
function repo(version = '1.2.3', tagVersion = version): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-release-version-'))
  dirs.push(dir)
  git(dir, 'init', '-b', 'main')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'axiom-framework', version }, null, 2))
  writeFileSync(join(dir, '.release-please-manifest.json'), JSON.stringify({ '.': version }, null, 2))
  writeFileSync(join(dir, 'CHANGELOG.md'), `# Changelog\n\n## ${version}\n\n- feat: something\n`)
  git(dir, 'add', '--', '.')
  git(dir, 'commit', '-m', 'chore: release')
  git(dir, 'tag', `axiom-framework-v${tagVersion}`)
  return { dir, version }
}

function run(dir: string, tag: string): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, script, '--tag', tag, '--root', dir], { cwd: dir })
  return {
    code: result.exitCode,
    out: result.stdout.toString().replaceAll('\r\n', '\n'),
    err: result.stderr.toString().replaceAll('\r\n', '\n'),
  }
}

test('accepts a release whose tag, package, manifest and changelog agree', () => {
  const { dir } = repo()
  const result = run(dir, 'axiom-framework-v1.2.3')
  expect(result.code).toBe(0)
  expect(result.out).toContain('release-version: OK')
})

test('rejects a tag whose version differs from package.json', () => {
  const { dir } = repo('1.2.3', '9.9.9')
  const result = run(dir, 'axiom-framework-v9.9.9')
  expect(result.code).toBe(1)
  expect(result.err).toContain('does not match the tag version')
})

test('rejects a manifest that disagrees with package.json', () => {
  const { dir } = repo()
  writeFileSync(join(dir, '.release-please-manifest.json'), JSON.stringify({ '.': '1.0.0' }, null, 2))
  const result = run(dir, 'axiom-framework-v1.2.3')
  expect(result.code).toBe(1)
  expect(result.err).toContain('does not match package.json')
})

test('rejects a changelog whose heading disagrees with package.json', () => {
  const { dir } = repo()
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 0.9.0\n\n- fix: something\n')
  const result = run(dir, 'axiom-framework-v1.2.3')
  expect(result.code).toBe(1)
  expect(result.err).toContain('CHANGELOG version')
})

test('accepts the release-please changelog heading format', () => {
  const { dir } = repo()
  writeFileSync(
    join(dir, 'CHANGELOG.md'),
    '# Changelog\n\n## [1.2.3](https://github.com/naml14/axiom-framework/compare/axiom-framework-v1.2.2...axiom-framework-v1.2.3) (2026-11-05)\n\n- feat: something\n',
  )
  const result = run(dir, 'axiom-framework-v1.2.3')
  expect(result.code).toBe(0)
  expect(result.out).toContain('release-version: OK')
})

test('rejects a missing tag', () => {
  const { dir } = repo()
  const result = run(dir, 'axiom-framework-v4.5.6')
  expect(result.code).toBe(1)
})

test('rejects a checked-out commit that is not the tagged one', () => {
  const { dir } = repo()
  writeFileSync(join(dir, 'README.md'), 'later commit\n')
  git(dir, 'add', '--', 'README.md')
  git(dir, 'commit', '-m', 'chore: later')
  const result = run(dir, 'axiom-framework-v1.2.3')
  expect(result.code).toBe(1)
  expect(result.err).toContain('HEAD is not the tagged commit')
})
