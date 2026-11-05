#!/usr/bin/env bun
// Validates that a release is coherent before it is published:
//   - the tag exists and points at the checked-out commit,
//   - package.json, the release-please manifest and the CHANGELOG agree
//     on the version, and that version is the one the tag names.
//
// Read-only: it inspects Git data and files, and never writes to either.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const options = new Map<string, string>()

function fail(message: string): never {
  console.error(`release-version: ${message}`)
  process.exit(1)
}

for (let i = 0; i < argv.length; i++) {
  const flag = argv[i]!
  if (flag !== '--tag' && flag !== '--root') fail(`unknown argument: ${flag}`)
  const value = argv[++i]
  if (!value || value.startsWith('-')) fail(`${flag} requires a value`)
  if (options.has(flag)) fail(`duplicate argument: ${flag}`)
  options.set(flag, value)
}

const tag = options.get('--tag') ?? fail('--tag is required')
const root = options.get('--root') ?? process.cwd()

function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root })
  if (result.exitCode !== 0) fail(`Git inspection failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString().trim()
}

function readJson(path: string): Record<string, unknown> {
  let raw: string
  try {
    raw = readFileSync(join(root, path), 'utf8')
  } catch {
    fail(`cannot read ${path}`)
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    fail(`${path} is not valid JSON`)
  }
}

// The tag names the version: <package>-v<version>.
const versionInTag = /-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag)
if (versionInTag === null) fail(`tag does not name a version: ${tag}`)
const tagVersion = versionInTag[1]!

const tagCommit = git(['rev-parse', '--verify', '--end-of-options', `${tag}^{commit}`])
const headCommit = git(['rev-parse', '--verify', 'HEAD^{commit}'])
if (tagCommit !== headCommit) {
  fail(`HEAD is not the tagged commit: ${headCommit} != ${tagCommit} (${tag})`)
}

const packageJson = readJson('package.json')
const packageVersion = packageJson['version']
if (typeof packageVersion !== 'string') fail('package.json has no version')
if (packageVersion !== tagVersion) {
  fail(`package.json version ${packageVersion} does not match the tag version ${tagVersion}`)
}

const manifest = readJson('.release-please-manifest.json')
const manifestVersion = manifest['.']
if (typeof manifestVersion !== 'string') fail('.release-please-manifest.json has no version for "."')
if (manifestVersion !== packageVersion) {
  fail(`manifest version ${manifestVersion} does not match package.json ${packageVersion}`)
}

let changelog: string
try {
  changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
} catch {
  fail('cannot read CHANGELOG.md')
}
const changelogVersion = /^##\s+\[?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/m.exec(changelog)
if (changelogVersion === null) fail('CHANGELOG.md has no version heading')
if (changelogVersion[1] !== packageVersion) {
  fail(`CHANGELOG version ${changelogVersion[1]} does not match package.json ${packageVersion}`)
}

console.log(`release-version: OK (${tag} → ${packageVersion})`)
