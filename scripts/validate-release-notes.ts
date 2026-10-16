#!/usr/bin/env bun
/**
 * Release Notes Guard
 *
 * Detects "phantom" CHANGELOG entries: entries whose linked commit was
 * reverted inside the same release range. release-please does not understand
 * `Revert "<subject>"` commits, so without this guard a release PR can
 * announce features that are no longer in the tree (see PR #118 / 0.9.14).
 *
 * An entry whose linked commit E is inside the range is phantom when some
 * commit R in the range has a subject starting with `Revert "` and any of:
 *   1. R's subject matches one of the entry's candidate original subjects;
 *   2. E is exactly R's first parent (R^), the commit the revert undoes;
 *   3. E is an ancestor of R^ inside the range AND the file sets of
 *      `git diff --name-only E^ E` and `git diff --name-only R^ R`
 *      intersect (first-parent diffs for merge commits). The file-set
 *      intersection prevents flagging unrelated ancestors of R^.
 *
 * Usage:
 *   bun run scripts/validate-release-notes.ts [--base <ref>] [--head <ref>]
 *
 * Defaults:
 *   --head  HEAD
 *   --base  most recent tag reachable from head (root commit if no tag)
 *
 * Exit codes:
 *   0 - no phantom entries (or nothing to check)
 *   1 - at least one CHANGELOG entry lists a commit reverted inside the range
 *
 * Read-only: this script only runs non-mutating git commands.
 */

interface RangeCommit {
	sha: string;
	subject: string;
}

interface ChangelogEntry {
	subject: string;
	sha: string;
	/** Candidate original commit subjects for this entry (raw text + conventional reconstruction). */
	candidates: string[];
}

interface PhantomEntry {
	entrySubject: string;
	commitSha: string;
	revertSha: string;
	revertSubject: string;
}

// ============================================================
// CLI arguments
// ============================================================

const argv = process.argv.slice(2);

function readOption(flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index === -1) return undefined;
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} requires a value`);
	}
	return value;
}

if (argv.includes("--help") || argv.includes("-h")) {
	console.log(
		[
			"Usage: bun run scripts/validate-release-notes.ts [--base <ref>] [--head <ref>]",
			"",
			"Fails (exit 1) when CHANGELOG.md at <head> lists an entry whose linked commit",
			'was reverted by a `Revert "<subject>"` commit inside <base>..<head>. An entry is',
			"phantom when its commit matches the revert subject, is the commit the revert",
			"undoes (its first parent), or is an in-range ancestor of that commit whose changed",
			"files intersect the revert's changed files.",
			"",
			"Defaults: --head HEAD, --base most recent tag reachable from head (root commit if none).",
			"Exit codes: 0 = clean, 1 = phantom entries found.",
		].join("\n"),
	);
	process.exit(0);
}

function fail(message: string): never {
	console.error(`release-notes-guard: ${message}`);
	process.exit(1);
}

// ============================================================
// Git helpers (read-only, via Bun.spawnSync)
// ============================================================

function git(args: string[]): { exitCode: number; stdout: string; stderr: string } {
	const result = Bun.spawnSync(["git", ...args]);
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function gitOrExit(args: string[]): string {
	const result = git(args);
	if (result.exitCode !== 0) {
		fail(`\`git ${args.join(" ")}\` failed: ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout;
}

function resolveRef(ref: string): string {
	return gitOrExit(["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

// ============================================================
// Range resolution
// ============================================================

const headRef = readOption("--head") ?? "HEAD";
const baseOption = readOption("--base");

const head = resolveRef(headRef);

let base: string;
let baseDescription: string;
if (baseOption !== undefined) {
	base = resolveRef(baseOption);
	baseDescription = baseOption;
} else {
	const tagResult = git(["describe", "--tags", "--abbrev=0", head]);
	const tag = tagResult.stdout.trim();
	if (tagResult.exitCode === 0 && tag.length > 0) {
		base = resolveRef(tag);
		baseDescription = tag;
	} else {
		// No tag reachable from head: fall back to the root commit.
		const roots = gitOrExit(["rev-list", "--max-parents=0", head]).trim().split("\n").filter(Boolean);
		const root = roots[roots.length - 1];
		if (root === undefined) {
			fail(`could not determine a base for ${headRef} (no tag and no root commit found)`);
		}
		base = root;
		baseDescription = `${root.slice(0, 7)} (root commit, no tag reachable from ${headRef})`;
	}
}

const rangeLabel = `${base.slice(0, 7)}..${head.slice(0, 7)}`;

// ============================================================
// Commits in range
// ============================================================

const logOutput = gitOrExit(["log", "--format=%H%x1f%s", `${base}..${head}`]);
const rangeCommits: RangeCommit[] = logOutput
	.split("\n")
	.filter((line) => line.length > 0)
	.map((line) => {
		const separator = line.indexOf("\x1f");
		return {
			sha: separator === -1 ? line : line.slice(0, separator),
			subject: separator === -1 ? "" : line.slice(separator + 1),
		};
	});

// Map: reverted subject -> reverting commit(s)
const revertsBySubject = new Map<string, RangeCommit>();
for (const commit of rangeCommits) {
	const match = /^Revert "(.*)"$/s.exec(commit.subject);
	if (match !== null) {
		const reverted = match[1];
		if (reverted !== undefined && !revertsBySubject.has(reverted)) {
			revertsBySubject.set(reverted, commit);
		}
	}
}

// Structural revert detection for rules 2-3: any commit whose subject starts
// with `Revert "`, regardless of whether the quoted text matches any entry.
const revertCommits = rangeCommits.filter((commit) => commit.subject.startsWith('Revert "'));
const rangeShas = new Set(rangeCommits.map((commit) => commit.sha));

// ============================================================
// CHANGELOG at head: newest version section
// ============================================================

const showResult = git(["show", `${head}:CHANGELOG.md`]);
if (showResult.exitCode !== 0) {
	console.log(`release-notes-guard: OK — no CHANGELOG.md at ${head.slice(0, 7)}; nothing to check (${rangeLabel}).`);
	process.exit(0);
}
const changelog = showResult.stdout;

const lines = changelog.split("\n");
const versionHeader = /^## \[(\d+\.\d+\.\d+)\]/;

let sectionStart = -1;
let sectionVersion = "";
for (let i = 0; i < lines.length; i++) {
	const match = versionHeader.exec(lines[i] ?? "");
	if (match !== null) {
		sectionStart = i;
		sectionVersion = match[1] ?? "";
		break;
	}
}

if (sectionStart === -1) {
	console.log(
		`release-notes-guard: OK — CHANGELOG.md at ${head.slice(0, 7)} has no version section (nothing released yet); nothing to check (${rangeLabel}).`,
	);
	process.exit(0);
}

let sectionEnd = lines.length;
for (let i = sectionStart + 1; i < lines.length; i++) {
	if (/^## /.test(lines[i] ?? "")) {
		sectionEnd = i;
		break;
	}
}

// Conventional-commit type per release-please subsection heading.
const typeByHeading: Record<string, string> = {
	features: "feat",
	"bug fixes": "fix",
	"performance improvements": "perf",
	reverts: "revert",
};

const shaLink = /(?:\(\[|\()([0-9a-f]{7,40})(?:\]|\))/;

const entries: ChangelogEntry[] = [];
let currentType: string | undefined;
for (const rawLine of lines.slice(sectionStart + 1, sectionEnd)) {
	const line = rawLine.trim();
	const heading = /^###\s+(.*)$/.exec(line);
	if (heading !== null) {
		currentType = typeByHeading[(heading[1] ?? "").trim().toLowerCase()];
		continue;
	}
	const bullet = /^[*-]\s+(.*)$/.exec(line);
	if (bullet === null) continue;

	const body = bullet[1] ?? "";
	const shaMatch = shaLink.exec(body);
	const sha = shaMatch?.[1];
	if (sha === undefined) continue;

	// Entry subject: bullet text without the trailing sha link.
	const subject = body
		.replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)\s*$/, "")
		.replace(/\s*\(([0-9a-f]{7,40})\)\s*$/, "")
		.trim();

	const candidates = [subject];
	// Reconstruct the conventional-commit subject release-please would have transformed:
	// `* **scope:** text` under `### Features` came from `feat(scope): text`.
	// release-please renders scopes as `**scope:** text` (colon inside the bold).
	const scoped = /^\*\*(.+?)(?::\*\*|\*\*:)\s*(.+)$/.exec(subject);
	if (currentType !== undefined) {
		if (scoped !== null) {
			candidates.push(`${currentType}(${scoped[1]}): ${scoped[2]}`);
		} else {
			candidates.push(`${currentType}: ${subject}`);
		}
	}

	entries.push({ subject, sha, candidates });
}

// ============================================================
// Phantom detection
// ============================================================

function findRangeCommit(sha: string): RangeCommit | undefined {
	return rangeCommits.find((commit) => commit.sha.startsWith(sha));
}

/** First parent of a commit, only when that parent is inside the range. */
function firstParentInRange(sha: string): string | undefined {
	const result = git(["rev-parse", "--verify", "--quiet", `${sha}^1`]);
	if (result.exitCode !== 0) return undefined;
	const parent = result.stdout.trim();
	return rangeShas.has(parent) ? parent : undefined;
}

function isAncestor(ancestor: string, descendant: string): boolean {
	return git(["merge-base", "--is-ancestor", ancestor, descendant]).exitCode === 0;
}

/** Files changed by a commit against its first parent (empty for root commits). */
function changedFiles(sha: string): Set<string> {
	const result = git(["diff", "--name-only", `${sha}^1`, sha]);
	if (result.exitCode !== 0) return new Set();
	return new Set(result.stdout.split("\n").filter((line) => line.length > 0));
}

function intersects(a: Set<string>, b: Set<string>): boolean {
	for (const item of a) {
		if (b.has(item)) return true;
	}
	return false;
}

const phantoms: PhantomEntry[] = [];
let checkedEntries = 0;
for (const entry of entries) {
	const commit = findRangeCommit(entry.sha);
	if (commit === undefined) continue; // linked commit is not part of this range
	checkedEntries++;

	let matchedRevert: RangeCommit | undefined;
	let matchedSubject: string | undefined;

	// Rule 1: subject match against the revert's quoted original subject.
	for (const candidate of entry.candidates) {
		const revert = revertsBySubject.get(candidate);
		if (revert !== undefined) {
			matchedRevert = revert;
			matchedSubject = candidate === entry.subject ? entry.subject : `${entry.subject} (as ${candidate})`;
			break;
		}
	}

	// Rules 2-3: structural match against what each revert actually undoes.
	if (matchedRevert === undefined) {
		for (const revert of revertCommits) {
			const revertedParent = firstParentInRange(revert.sha);
			if (revertedParent === undefined) continue;
			// Rule 2: the entry's commit is exactly the commit the revert undoes (R^).
			if (commit.sha === revertedParent) {
				matchedRevert = revert;
				matchedSubject = entry.subject;
				break;
			}
			// Rule 3: the entry's commit is an ancestor of R^ inside the range and its
			// file changes intersect the revert's (guards against unrelated ancestors).
			if (
				isAncestor(commit.sha, revertedParent) &&
				intersects(changedFiles(commit.sha), changedFiles(revert.sha))
			) {
				matchedRevert = revert;
				matchedSubject = entry.subject;
				break;
			}
		}
	}

	if (matchedRevert !== undefined && matchedSubject !== undefined) {
		phantoms.push({
			entrySubject: matchedSubject,
			commitSha: commit.sha,
			revertSha: matchedRevert.sha,
			revertSubject: matchedRevert.subject,
		});
	}
}

// ============================================================
// Report
// ============================================================

if (phantoms.length > 0) {
	console.error(
		`release-notes-guard: FAIL — CHANGELOG ${sectionVersion} lists ${phantoms.length} phantom ${
			phantoms.length === 1 ? "entry" : "entries"
		} (commit reverted inside ${rangeLabel}):`,
	);
	for (const phantom of phantoms) {
		console.error(
			`  - "${phantom.entrySubject}" — commit ${phantom.commitSha.slice(0, 7)}, reverted by ${phantom.revertSha.slice(0, 7)} (${phantom.revertSubject})`,
		);
	}
	console.error("Remove these entries from the release notes before publishing.");
	process.exit(1);
}

console.log(
	`release-notes-guard: OK — CHANGELOG ${sectionVersion}: ${checkedEntries} ${
		checkedEntries === 1 ? "entry" : "entries"
	} in range ${rangeLabel}, no reverted commit is listed as shipped.`,
);
process.exit(0);
