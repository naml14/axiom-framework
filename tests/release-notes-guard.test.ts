import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(repoRoot, "scripts", "validate-release-notes.ts");

const tempDirs: string[] = [];
afterAll(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
});

async function freshRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "axiom-release-notes-"));
	tempDirs.push(dir);
	return dir;
}

function git(dir: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
	const result = Bun.spawnSync(["git", ...args], { cwd: dir });
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function gitOrThrow(dir: string, args: string[]): string {
	const result = git(dir, args);
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed (${result.exitCode}): ${result.stderr}`);
	}
	return result.stdout.trim();
}

/** Run a git command with an explicit identity so synthetic repos never depend on global git config. */
function gitWithIdentity(dir: string, args: string[]): string {
	return gitOrThrow(dir, [
		"-c", "user.name=Release Notes Test",
		"-c", "user.email=release-notes-test@example.com",
		"-c", "commit.gpgsign=false",
		...args,
	]);
}

/** Commit with an explicit identity so the synthetic repos never depend on global git config. */
function commit(dir: string, subject: string): string {
	gitOrThrow(dir, ["add", "-A"]);
	gitWithIdentity(dir, ["commit", "-m", subject]);
	return gitOrThrow(dir, ["rev-parse", "HEAD"]);
}

async function initRepo(): Promise<string> {
	const dir = await freshRepo();
	gitOrThrow(dir, ["init", "-b", "main"]);
	await writeFile(join(dir, "README.md"), "# synthetic repo\n");
	return dir;
}

function runGuard(dir: string, base: string, head: string) {
	const result = Bun.spawnSync(
		[process.execPath, scriptPath, "--base", base, "--head", head],
		{ cwd: dir },
	);
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

const featSubject = "feat(x): add flag";

/**
 * Shared synthetic history:
 *   base commit -> feat(x): add flag -> CHANGELOG entry -> Revert "feat(x): add flag"
 * Never touches the real repository history.
 */
async function buildHistory(changelogEntry: (featSha: string) => string | null): Promise<{
	dir: string;
	baseSha: string;
	featSha: string;
	changelogSha: string;
	revertSha: string;
}> {
	const dir = await initRepo();
	const baseSha = commit(dir, "chore: initial commit");

	await writeFile(join(dir, "flag.ts"), "export const flag = true\n");
	const featSha = commit(dir, featSubject);

	const entry = changelogEntry(featSha);
	const changelog = [
		"# Changelog",
		"",
		"## [1.2.3](https://example.com/compare/v1.2.2...v1.2.3) (2026-01-01)",
		"",
		"### Features",
		"",
		...(entry === null ? [] : [entry]),
		"",
	].join("\n");
	await writeFile(join(dir, "CHANGELOG.md"), changelog);
	const changelogSha = commit(dir, "docs(changelog): add 1.2.3");

	// Undo the feature content so the revert commit has a real tree change
	await writeFile(join(dir, "flag.ts"), "export const flag = false\n");
	const revertSha = commit(dir, `Revert "${featSubject}"`);
	return { dir, baseSha, featSha, changelogSha, revertSha };
}

describe("release-notes-guard", () => {
	test("(a) phantom entry (reverted commit still listed) exits 1 and names the entry", async () => {
		const history = await buildHistory(
			(featSha) => `* ${featSubject} ([${featSha.slice(0, 7)}](https://example.com/commit/${featSha}))`,
		);

		const result = runGuard(history.dir, history.baseSha, history.revertSha);
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.exitCode).toBe(1);
		expect(output).toContain(featSubject);
		expect(output).toContain(history.featSha.slice(0, 7));
		expect(output).toContain(history.revertSha.slice(0, 7));
	});

	test("(a2) phantom entry in release-please format is detected too", async () => {
		const history = await buildHistory(
			(featSha) => `* **x:** add flag ([${featSha.slice(0, 7)}](https://example.com/commit/${featSha}))`,
		);

		const result = runGuard(history.dir, history.baseSha, history.revertSha);
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.exitCode).toBe(1);
		expect(output).toContain("feat(x): add flag");
	});

	test("(b) same history with the CHANGELOG entry removed exits 0", async () => {
		const history = await buildHistory(() => null);

		const result = runGuard(history.dir, history.baseSha, history.revertSha);

		expect(result.exitCode).toBe(0);
	});

	test("(c) no reverts at all exits 0 even with the entry listed", async () => {
		const history = await buildHistory(
			(featSha) => `* ${featSubject} ([${featSha.slice(0, 7)}](https://example.com/commit/${featSha}))`,
		);

		// head stops before the revert commit
		const result = runGuard(history.dir, history.baseSha, history.changelogSha);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim().length).toBeGreaterThan(0);
	});

	test("(d) merge-based revert flags both the merge sha and a feature-commit sha under it", async () => {
		const dir = await initRepo();
		const baseSha = commit(dir, "chore: initial commit");

		// Feature commit on a side branch, merged with a PR-style merge commit.
		gitOrThrow(dir, ["checkout", "-b", "feature"]);
		await writeFile(join(dir, "flag.ts"), "export const flag = true\n");
		const featureSha = commit(dir, featSubject);

		gitOrThrow(dir, ["checkout", "main"]);
		gitWithIdentity(dir, ["merge", "--no-ff", "-m", "Merge pull request #1 feature", "feature"]);
		const mergeSha = gitOrThrow(dir, ["rev-parse", "HEAD"]);

		// Revert the merge directly (parent of the revert is the merge commit).
		gitWithIdentity(dir, ["revert", "-m", "1", "--no-edit", mergeSha]);
		const revertSha = gitOrThrow(dir, ["rev-parse", "HEAD"]);

		// CHANGELOG lists the PR title twice: once linked to the merge sha, once to the feature sha.
		const changelog = [
			"# Changelog",
			"",
			"## [1.2.3](https://example.com/compare/v1.2.2...v1.2.3) (2026-01-01)",
			"",
			"### Features",
			"",
			`* ${featSubject} ([${mergeSha.slice(0, 7)}](https://example.com/commit/${mergeSha}))`,
			`* ${featSubject} ([${featureSha.slice(0, 7)}](https://example.com/commit/${featureSha}))`,
			"",
		].join("\n");
		await writeFile(join(dir, "CHANGELOG.md"), changelog);
		const headSha = commit(dir, "docs(changelog): add 1.2.3");

		const result = runGuard(dir, baseSha, headSha);
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.exitCode).toBe(1);
		expect(output).toContain(mergeSha.slice(0, 7));
		expect(output).toContain(featureSha.slice(0, 7));
		expect(output).toContain(revertSha.slice(0, 7));
	});

	test("(e) ancestor of the reverted commit with disjoint files is not flagged", async () => {
		const dir = await initRepo();
		const baseSha = commit(dir, "chore: initial commit");

		// An unrelated ancestor commit touching a disjoint file.
		await writeFile(join(dir, "unrelated.ts"), "export const unrelated = 1\n");
		const unrelatedSha = commit(dir, "feat(y): unrelated");

		await writeFile(join(dir, "flag.ts"), "export const flag = true\n");
		const featSha2 = commit(dir, featSubject);

		gitWithIdentity(dir, ["revert", "--no-edit", featSha2]);

		// CHANGELOG lists only the unrelated ancestor of the reverted commit.
		const changelog = [
			"# Changelog",
			"",
			"## [1.2.3](https://example.com/compare/v1.2.2...v1.2.3) (2026-01-01)",
			"",
			"### Features",
			"",
			`* feat(y): unrelated ([${unrelatedSha.slice(0, 7)}](https://example.com/commit/${unrelatedSha}))`,
			"",
		].join("\n");
		await writeFile(join(dir, "CHANGELOG.md"), changelog);
		const headSha = commit(dir, "docs(changelog): add 1.2.3");

		const result = runGuard(dir, baseSha, headSha);

		expect(result.exitCode).toBe(0);
	});

	test("entry whose sha is outside the range is not flagged", async () => {
		const history = await buildHistory(
			() => `* ${featSubject} ([0000000](https://example.com/commit/0000000000000000000000000000000000000000))`,
		);

		const result = runGuard(history.dir, history.baseSha, history.revertSha);

		expect(result.exitCode).toBe(0);
	});
});
