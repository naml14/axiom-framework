import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	await writeFile(join(dir, "flag.ts"), "export const flag = false\n");
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
	test("S120-A bot updates explicitly dispatch CI and publish a status on the checked SHA", async () => {
		const ci = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
		const release = await readFile(join(repoRoot, ".github/workflows/release-please.yml"), "utf8");
		expect(ci).toContain("workflow_dispatch:");
		expect(ci).toContain('branches: [main, "release-please--**"]');
		expect(ci).toContain("ref: ${{ inputs.release-head || github.event.pull_request.head.sha || github.sha }}");
		expect(ci).toContain('"repos/$GITHUB_REPOSITORY/statuses/$RELEASE_HEAD"');
		expect(release).toContain("actions: write");
		expect(release).toContain('gh workflow run ci.yml --ref "$DEFAULT_BRANCH" -f release-head="$sha"');
		expect(release).toContain("state=pending");
	});

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
		// GitHub's PR #109 revert had only a different PR title, not a target body.
		gitWithIdentity(dir, ["commit", "--amend", "-m", 'Revert "feat(typo): PR title differs from commits"']);
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

	test("S120-E rejects unknown arguments before resolving refs", async () => {
		const dir = await initRepo();
		const result = Bun.spawnSync([process.execPath, scriptPath, "--baes", "missing"], { cwd: dir });
		expect(result.exitCode).toBe(1);
		expect(result.stdout.toString()).toBe("");
		expect(result.stderr.toString()).toBe("release-notes-guard: unknown argument: --baes\n");
	});

	test("S120-F rejects reversed ranges", async () => {
		const history = await buildHistory(() => null);
		const result = runGuard(history.dir, history.revertSha, history.baseSha);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("base must be an ancestor of head");
	});

	test("S120-G a revert of a revert restores the feature", async () => {
		const history = await buildHistory((sha) => `* restored (${sha})`);
		gitWithIdentity(history.dir, ["revert", "--no-edit", history.revertSha]);
		const result = runGuard(history.dir, history.baseSha, "HEAD");
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
	});

	test("a later unrelated edit to a reverted file does not hide the revert", async () => {
		// The real 0.9.14 shape: the feature is reverted, and a later commit
		// legitimately touches the same file. Requiring the whole file to be
		// byte-identical to its pre-entry state would hide the removal.
		const dir = await initRepo();
		const base = commit(dir, "initial");
		await writeFile(join(dir, "cli.ts"), "export const cli = 1\n");
		const feat = commit(dir, "feat: add cli flag");
		gitWithIdentity(dir, ["revert", "--no-edit", feat]);
		await writeFile(join(dir, "cli.ts"), "export const cli = 2\n");
		const later = commit(dir, "fix(cli): unrelated follow-up");
		await writeFile(join(dir, "CHANGELOG.md"), `## [1.2.3]\n* add cli flag (${feat})\n`);
		const head = commit(dir, "notes");

		const result = runGuard(dir, base, head);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(feat.slice(0, 7));
		expect(result.stderr).toContain("Remove these entries");
		// The unrelated follow-up commit must not be reported either.
		expect(result.stderr).not.toContain(later.slice(0, 7));
	});

	for (const sameSubject of [false, true]) {
		test(`S120-H/I/J preserved ancestor and revert parent, same subject=${sameSubject}`, async () => {
			const dir = await initRepo();
			const base = commit(dir, "initial");
			await writeFile(join(dir, "flag.ts"), "export const flag = true\n");
			const kept = commit(dir, "feat: same subject");
			await writeFile(join(dir, "flag.ts"), "export const flag = true\nexport const extra = 1\n");
			const removed = commit(dir, sameSubject ? "feat: same subject" : "feat: extra");
			await writeFile(join(dir, "parent.ts"), "export const parent = true\n");
			const parent = commit(dir, "feat: parent survives");
			gitWithIdentity(dir, ["revert", "--no-edit", removed]);
			await writeFile(join(dir, "CHANGELOG.md"), `## [1.2.3]\n* feat: same subject (${kept})\n* parent (${parent})\n`);
			const head = commit(dir, "notes");
			const result = runGuard(dir, base, head);
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
		});
	}

	test("S120-D a reverted rename is detected regardless of its subject", async () => {
		const dir = await initRepo();
		const base = commit(dir, "initial");
		gitOrThrow(dir, ["mv", "flag.ts", "renamed.ts"]);
		const renamed = commit(dir, "feat: rename flag");
		await writeFile(join(dir, "unrelated.ts"), "export const unrelated = true\n");
		commit(dir, "unrelated parent");
		gitWithIdentity(dir, ["revert", "--no-edit", renamed]);
		gitWithIdentity(dir, ["commit", "--amend", "-m", 'Revert "different PR title"']);
		await writeFile(join(dir, "CHANGELOG.md"), `## [1.2.3]\n* different rendered title (${renamed})\n`);
		const head = commit(dir, "notes");
		const result = runGuard(dir, base, head);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain(renamed.slice(0, 7));
	});

	test("S120-C ambiguous seven-character SHAs fail explicitly", async () => {
		const dir = await initRepo();
		const base = commit(dir, "initial");
		const tree = gitOrThrow(dir, ["rev-parse", "HEAD^{tree}"]);
		const seen = new Map<string, string>();
		let pair: [string, string] | undefined;
		for (let nonce = 0; nonce < 200000; nonce++) {
			const raw = `tree ${tree}\nparent ${base}\nauthor Test <test@example.com> 1700000000 +0000\ncommitter Test <test@example.com> 1700000000 +0000\n\ncollision ${nonce}\n`;
			const sha = createHash("sha1").update(`commit ${Buffer.byteLength(raw)}\0${raw}`).digest("hex");
			const prefix = sha.slice(0, 7);
			const previous = seen.get(prefix);
			if (previous !== undefined) { pair = [previous, raw]; break; }
			seen.set(prefix, raw);
		}
		if (pair === undefined) throw new Error("deterministic collision search exhausted");
		const shas = pair.map((raw) => {
			const result = Bun.spawnSync(["git", "hash-object", "-t", "commit", "-w", "--stdin"], { cwd: dir, stdin: Buffer.from(raw) });
			expect(result.exitCode).toBe(0);
			return result.stdout.toString().trim();
		});
		const merged = gitWithIdentity(dir, ["commit-tree", tree, "-p", shas[0]!, "-p", shas[1]!, "-m", "merge collision"]);
		gitOrThrow(dir, ["update-ref", "HEAD", merged]);
		await writeFile(join(dir, "CHANGELOG.md"), `## [1.2.3]\n* ambiguous (${shas[0]!.slice(0, 7)})\n`);
		const head = commit(dir, "notes");
		const result = runGuard(dir, base, head);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("ambiguous commit prefix");
	});

	test("S120-B a missing tree fails closed instead of skipping a diff", async () => {
		const history = await buildHistory((sha) => `* unrelated rendered title (${sha})`);
		// A valid commit object referencing an absent tree simulates corrupt history
		// without deleting objects or relying on the real repository.
		const raw = `tree ${"1".repeat(40)}\nparent ${history.revertSha}\nauthor Test <test@example.com> 1700000000 +0000\ncommitter Test <test@example.com> 1700000000 +0000\n\nRevert "corrupt"\n`;
		const object = Bun.spawnSync(["git", "hash-object", "-t", "commit", "-w", "--stdin"], { cwd: history.dir, stdin: Buffer.from(raw) });
		expect(object.exitCode).toBe(0);
		const broken = object.stdout.toString().trim();
		const result = runGuard(history.dir, history.baseSha, broken);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("failed:");
	});

	test("entry whose sha is outside the range is not flagged", async () => {
		const history = await buildHistory(
			() => `* ${featSubject} ([0000000](https://example.com/commit/0000000000000000000000000000000000000000))`,
		);

		const result = runGuard(history.dir, history.baseSha, history.revertSha);

		expect(result.exitCode).toBe(0);
	});
});
