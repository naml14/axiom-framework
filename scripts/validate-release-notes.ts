#!/usr/bin/env bun
/**
 * Release Notes Guard
 *
 * Detects "phantom" CHANGELOG entries: entries whose linked commit was
 * reverted inside the same release range. release-please does not understand
 * `Revert "<subject>"` commits, so without this guard a release PR can
 * announce features that are no longer in the tree (see PR #118 / 0.9.14).
 *
 * Reverts are associated with original commits by inverse patch identity,
 * never by subject or the revert's parent alone. An entry (including an
 * interior commit of a reverted merge) is phantom only when the revert
 * restored its changed paths to their pre-entry state AND the change did not
 * survive at the range head. A later unrelated edit to the same file does
 * not hide the removal, and a restored change is not reported.
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
 *   1 - phantom entries, invalid arguments/range, or a required Git inspection failed
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

for (let index = 0; index < argv.length; index++) {
	const argument = argv[index];
	if (argument === "--base" || argument === "--head") {
		readOption(argument);
		index++;
	} else if (argument !== "--help" && argument !== "-h") {
		fail(`unknown argument: ${argument}`);
	}
}

if (argv.includes("--help") || argv.includes("-h")) {
	console.log(
		[
			"Usage: bun run scripts/validate-release-notes.ts [--base <ref>] [--head <ref>]",
			"",
			"Fails (exit 1) when CHANGELOG.md at <head> lists an entry whose linked commit",
			'was undone by a `Revert "<subject>"` commit inside <base>..<head>.',
			"Inverse patches identify the target; changed paths must be restored to their",
			"pre-entry state at the revert, and the change must not survive at head.",
			"Reverted merges include their interior commits.",
			"Unknown arguments, ambiguous SHAs, invalid ranges and Git inspection errors fail closed.",
			"",
			"Defaults: --head HEAD, --base most recent tag reachable from head (root commit if none).",
			"Exit codes: 0 = clean, 1 = phantom entries or invalid input/history.",
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

if (!isAncestor(base, head)) fail("base must be an ancestor of head");
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

const revertCommits = rangeCommits.filter((commit) => commit.subject.startsWith('Revert "'));

// ============================================================
// CHANGELOG at head: newest version section
// ============================================================

const changelogPath = gitOrExit(["ls-tree", head, "--", "CHANGELOG.md"]);
if (changelogPath.trim() === "") {
	console.log(`release-notes-guard: OK — no CHANGELOG.md at ${head.slice(0, 7)}; nothing to check (${rangeLabel}).`);
	process.exit(0);
}
const changelog = gitOrExit(["show", `${head}:CHANGELOG.md`]);

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
	const matches = rangeCommits.filter((commit) => commit.sha.startsWith(sha));
	if (matches.length > 1) fail(`ambiguous commit prefix: ${sha} matches ${matches.length} commits in range`);
	return matches[0];
}

function isAncestor(ancestor: string, descendant: string): boolean {
	const args = ["merge-base", "--is-ancestor", ancestor, descendant];
	const result = git(args);
	if (result.exitCode > 1 || result.exitCode < 0) {
		fail(`\`git ${args.join(" ")}\` failed: ${result.stderr.trim()}`);
	}
	return result.exitCode === 0;
}

/** Include both sides of renames; NUL delimiters preserve unusual path names. */
function changedFiles(sha: string): Set<string> {
	const fields = gitOrExit(["diff", "--name-status", "-z", "-M", `${sha}^1`, sha]).split("\0");
	const paths = new Set<string>();
	for (let index = 0; index < fields.length - 1;) {
		const status = fields[index++] ?? "";
		paths.add(fields[index++] ?? "");
		if (status.startsWith("R") || status.startsWith("C")) paths.add(fields[index++] ?? "");
	}
	return paths;
}

const patchIds = new Map<string, string>();
function patchId(sha: string, reverse = false): string {
	const key = `${sha}:${reverse}`;
	const cached = patchIds.get(key);
	if (cached !== undefined) return cached;
	const refs = reverse ? [sha, `${sha}^1`] : [`${sha}^1`, sha];
	const patch = gitOrExit(["diff", "--no-ext-diff", "--no-textconv", "--binary", ...refs]);
	const result = Bun.spawnSync(["git", "patch-id", "--stable"], { stdin: Buffer.from(patch) });
	if (result.exitCode !== 0) fail(`\`git patch-id --stable\` failed: ${result.stderr.toString().trim()}`);
	const id = result.stdout.toString().trim().split(/\s/)[0] ?? "";
	patchIds.set(key, id);
	return id;
}

/** Tree entries include mode, object identity and path; absent paths are significant. */
function pathState(ref: string, path: string): string {
	return gitOrExit(["ls-tree", "-z", ref, "--", `:(literal)${path}`]);
}

/**
 * True when `tip` still contains the change that `entry` introduced.
 *
 * The check is per path and asks whether the entry's post-image survives at
 * the tip, not whether the whole path is byte-identical to the pre-entry
 * state. A later, unrelated edit to the same file must not hide a revert,
 * and a surviving change must not be reported as removed.
 */
function changeSurvivesAt(entry: string, tip: string): boolean {
	const paths = changedFiles(entry);
	if (paths.size === 0) return false;
	for (const path of paths) {
		// Absent at both ends: the path was added and then removed again.
		if (pathState(`${entry}^1`, path) === "" && pathState(tip, path) === "") continue;
		// The entry's own post-image is still there: the change survived.
		if (pathState(`${entry}`, path) === pathState(tip, path)) return true;
	}
	return false;
}

/**
 * True when the revert actually undid the entry's change: every path the
 * entry touched is back to its pre-entry content at the revert commit.
 */
function removedAt(entry: string, revert: string): boolean {
	const paths = changedFiles(entry);
	if (paths.size === 0) return false;
	for (const path of paths) {
		const before = pathState(`${entry}^1`, path);
		if (pathState(revert, path) !== before) return false;
	}
	return true;
}

// Search by patch, not title/body: GitHub reverts may omit the target SHA and
// quote a PR title different from both the merge subject and interior subjects.
const targets = new Map<string, RangeCommit[]>();
for (const revert of revertCommits) {
	const inverse = patchId(revert.sha, true);
	targets.set(revert.sha, rangeCommits.filter((candidate) =>
		candidate.sha !== revert.sha && inverse !== "" &&
		isAncestor(candidate.sha, revert.sha) && patchId(candidate.sha) === inverse,
	));
}

const phantoms: PhantomEntry[] = [];
let checkedEntries = 0;
for (const entry of entries) {
	const commit = findRangeCommit(entry.sha);
	if (commit === undefined) continue; // linked commit is not part of this range
	checkedEntries++;

	let matchedRevert: RangeCommit | undefined;
	let matchedSubject: string | undefined;

	for (const revert of revertCommits) {
		for (const target of targets.get(revert.sha) ?? []) {
			// The entry is inside the reverted change, the revert restored the
			// pre-entry content, and the change did not come back afterwards.
			if (
				isAncestor(commit.sha, target.sha) &&
				removedAt(commit.sha, revert.sha) &&
				!changeSurvivesAt(commit.sha, head)
			) {
				matchedRevert = revert;
				const candidate = entry.candidates.find((subject) => subject === commit.subject);
				matchedSubject = candidate !== undefined && candidate !== entry.subject
					? `${entry.subject} (as ${candidate})` : entry.subject;
				break;
			}
		}
		if (matchedRevert !== undefined) break;
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
