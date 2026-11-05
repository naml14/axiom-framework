import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  bin: { 'create-axiom': string };
  files: string[];
};
const bin = manifest.bin['create-axiom'];
const binPath = bin.replace(/^\.\//, '');

describe('published CLI', () => {
  test('ships a Bun launcher that npm accepts and retains its implementation', () => {
    expect(binPath.endsWith('.ts')).toBe(false);
    expect(existsSync(join(root, binPath))).toBe(true);
    expect(manifest.files).toContain(binPath);
    expect(manifest.files).toContain('scripts/create-axiom.ts');
    expect(readFileSync(join(root, binPath), 'utf8').startsWith('#!/usr/bin/env bun\n')).toBe(true);
  });

  test('launcher invokes the CLI and preserves direct execution on rejected input', () => {
    for (const entry of [binPath, 'scripts/create-axiom.ts']) {
      const result = Bun.spawnSync([process.execPath, join(root, entry), '--help'], {
        cwd: tmpdir(),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe('');
      expect(result.stderr.toString()).toContain('Failed to create project:');
      expect(result.stderr.toString()).toContain(
        'Invalid project name: "--help". Use only alphanumeric characters, dots, dashes, and underscores.',
      );
    }
  });

  test.skipIf(!Bun.which('npm'))('npm dry-run includes the launcher without removing the bin', () => {
    const cache = mkdtempSync(join(tmpdir(), 'axiom-pack-'));
    try {
      const result = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json'], {
        cwd: root,
        env: { ...process.env, npm_config_cache: cache, npm_config_ignore_scripts: 'true' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).not.toMatch(/bin\[create-axiom\].*invalid and removed/);
      const packages = JSON.parse(result.stdout.toString()) as Array<{
        files: Array<{ path: string }>;
      }>;
      expect(packages).toHaveLength(1);
      const paths = packages[0]!.files.map(file => file.path);
      expect(paths).toContain('package.json');
      expect(paths).toContain(binPath);
      expect(paths).toContain('scripts/create-axiom.ts');
      expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).bin).toEqual(manifest.bin);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});
