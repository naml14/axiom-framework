#!/usr/bin/env bun
/** Read-only per-commit release scope guard. See docs/RELEASE_SCOPE.md. */
const argv = process.argv.slice(2)
const options = new Map<string, string>()
function fail(message: string): never {
  console.error(`release-scope: ${message}`)
  process.exit(1)
}
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: bun run scripts/validate-release-scope.ts --base <ref> [--head <ref>]\n\nRejects each non-merge feat, fix, or breaking commit without src/ changes.\nDefaults: --head HEAD. Exit codes: 0 = clean, 1 = rejected or invalid input.\nRead-only; requires full Git history. See docs/RELEASE_SCOPE.md.')
  process.exit(0)
}
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i]!
  if (flag !== '--base' && flag !== '--head') fail(`unknown argument: ${flag}`)
  const value = argv[++i]
  if (!value || value.startsWith('-')) fail(`${flag} requires a value`)
  if (options.has(flag)) fail(`duplicate argument: ${flag}`)
  options.set(flag, value)
}
const baseRef = options.get('--base') ?? fail('--base is required')
const headRef = options.get('--head') ?? 'HEAD'
function git(args: string[]) {
  return Bun.spawnSync(['git', ...args])
}
function output(args: string[]): string {
  const r = git(args)
  if (r.exitCode !== 0) fail(`Git inspection failed: ${r.stderr.toString().trim()}`)
  return r.stdout.toString()
}
function resolve(ref: string): string {
  const r = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
  if (r.exitCode !== 0) fail(`cannot resolve commit: ${ref}`)
  return r.stdout.toString().trim()
}
const base = resolve(baseRef)
const head = resolve(headRef)
if (git(['merge-base', '--is-ancestor', base, head]).exitCode !== 0) fail('base must be an ancestor of head')
const commits = output(['rev-list', '--reverse', '--no-merges', `${base}..${head}`]).trim().split('\n').filter(Boolean)
let rejected = false
for (const sha of commits) {
  const message = output(['show', '-s', '--format=%B', sha])
  const subject = message.split('\n')[0]!
  if (/^chore\(main\): release\b/.test(subject)) continue
  const header = /^([a-z0-9-]+)(?:\([^\r\n)]+\))?(!)?: /.exec(subject)
  const bumps = header?.[1] === 'feat' || header?.[1] === 'fix' || Boolean(header?.[2])
    || /^BREAKING[ -]CHANGE: /m.test(message)
  if (!bumps) continue
  const files = output(['diff-tree', '--root', '--no-commit-id', '--name-only', '-z', '-r', sha])
    .split('\0').filter(Boolean)
  if (files.some(file => file.startsWith('src/'))) continue
  rejected = true
  console.error(`release-scope: rejected ${sha} ${subject}\nFiles: ${files.join(', ') || '(none)'}\nUse chore:, docs:, test: or ci: for changes outside src/.`)
}
if (rejected) process.exit(1)
console.log(`release-scope: OK (${commits.length} ${commits.length === 1 ? 'commit' : 'commits'} checked)`)
