#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";

/**
 * Maintainer Review Guard
 *
 * The entry gate of `main` is a WRITTEN review by the maintainer on the exact
 * commit being merged. GitHub refuses to let a pull request author approve
 * their own pull request ("Review Can not approve your own pull request"), and
 * the code in this repository is written by the AI harness under the
 * maintainer's account, so a required approving review could never be
 * satisfied without an admin bypass.
 *
 * The gate is therefore expressed as a commit status: this script verifies that
 * the pull request carries a written review by the maintainer on its head
 * commit, and (with --publish) reports that verdict as the "Maintainer
 * review" status the branch ruleset requires. Because the status is attached
 * to a commit, any later push by the harness invalidates it: the gate closes
 * until the new head is reviewed again.
 *
 * --publish only ever reports a verdict read from the real pull request: the
 * overrides that exist for fixtures (--repo, --head, --maintainer,
 * --reviews-file) are refused, so a fabricated review can never open the gate.
 *
 * Usage:
 *   bun run scripts/validate-maintainer-review.ts --pr <number> [--repo <owner/name>]
 *     [--head <sha>] [--maintainer <login>] [--reviews-file <path>] [--publish] [--dry-run]
 *
 * Defaults:
 *   --repo       $GITHUB_REPOSITORY, else the repository of the current checkout
 *   --head       the pull request head SHA
 *   --maintainer the repository owner
 *
 * Exit codes:
 *   0 - a written maintainer review exists on the head commit
 *   1 - no such review, or invalid arguments/API response
 *
 * Read-only unless --publish is given.
 */

interface Review {
	user: { login: string };
	state: string;
	body: string;
	commit_id: string | null;
	id?: number;
}

interface Verdict {
	ok: boolean;
	reason: string;
}

const STATUS_CONTEXT = "Maintainer review";
const SATISFYING_STATES = ["COMMENTED", "APPROVED"];
const IGNORED_STATES = ["PENDING", "DISMISSED"];
/** Options that exist for fixtures; none of them may shape a published verdict. */
const PUBLISH_FORBIDDEN_OPTIONS = ["--repo", "--head", "--maintainer", "--reviews-file"];

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
	if (argument === "--pr" || argument === "--repo" || argument === "--head" || argument === "--maintainer" || argument === "--reviews-file") {
		readOption(argument);
		index++;
	} else if (argument !== "--publish" && argument !== "--dry-run" && argument !== "--help" && argument !== "-h") {
		fail(`unknown argument: ${argument}`);
	}
}

if (argv.includes("--help") || argv.includes("-h")) {
	console.log(
		[
			"Usage: bun run scripts/validate-maintainer-review.ts --pr <number> [options]",
			"",
			"Verifies that the pull request carries a WRITTEN review by the maintainer",
			"on its head commit, and optionally reports that verdict as the",
			`'${STATUS_CONTEXT}' commit status required by the branch ruleset.`,
			"",
			"Options:",
			"  --pr <number>            pull request number (required)",
			"  --repo <owner/name>      repository (default: $GITHUB_REPOSITORY or the current checkout)",
			"  --head <sha>             head commit to require the review on (default: the pull request head)",
			"  --maintainer <login>     reviewer whose written review is required (default: the repository owner)",
			"  --reviews-file <path>    read reviews from a JSON file instead of the API (for fixtures)",
			"  --publish                publish the verdict as the commit status",
			"  --dry-run                report the status that would be published, without publishing it",
			"",
			`--publish refuses ${PUBLISH_FORBIDDEN_OPTIONS.join(", ")}: a published verdict is always`,
			"read from the real pull request, so no fixture or override can open the gate.",
			"",
			"Exit codes: 0 = written maintainer review present, 1 = absent or invalid input.",
		].join("\n"),
	);
	process.exit(0);
}

function fail(message: string): never {
	console.error(`maintainer-review-guard: ${message}`);
	process.exit(1);
}

// ============================================================
// GitHub helpers
// ============================================================

function gh(args: string[]): { exitCode: number; stdout: string; stderr: string } {
	const result = Bun.spawnSync(["gh", "api", ...args]);
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

const publishRequested = argv.includes("--publish");
const dryRun = argv.includes("--dry-run");

if (publishRequested) {
	const forbidden = PUBLISH_FORBIDDEN_OPTIONS.filter((flag) => argv.includes(flag));
	if (forbidden.length > 0) {
		fail(`--publish forbids ${forbidden.join(", ")}: the published verdict must be read from the real pull request`);
	}
}

let repo: string | undefined;
let headSha: string | undefined;

function resolveRepo(): string {
	const explicit = readOption("--repo");
	if (explicit !== undefined) return explicit;
	const fromEnv = process.env.GITHUB_REPOSITORY;
	if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
	const result = Bun.spawnSync(["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
	if (result.exitCode !== 0) {
		fail("could not resolve the repository: pass --repo or set GITHUB_REPOSITORY");
	}
	return result.stdout.toString().trim();
}

function resolveHeadSha(): string {
	const explicit = readOption("--head");
	if (explicit !== undefined) return explicit;
	const result = gh([`repos/${repo}/pulls/${pullRequestNumber}`, "--jq", ".head.sha"]);
	if (result.exitCode !== 0) {
		fail(`could not read the pull request head: ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout.toString().trim();
}

/**
 * Reports the verdict as the commit status the ruleset requires. Without
 * --publish nothing is written; with --dry-run the payload is printed instead.
 */
function publishStatus(state: string, description: string): boolean {
	if (repo === undefined || headSha === undefined) {
		console.error(`maintainer-review-guard: cannot report '${STATUS_CONTEXT}': the pull request head is unknown`);
		return false;
	}
	if (dryRun) {
		console.log(
			`maintainer-review-guard: dry run — would publish state=${state} context=${STATUS_CONTEXT} description=${description} sha=${headSha}`,
		);
		return true;
	}
	const result = gh([
		"--method",
		"POST",
		`repos/${repo}/statuses/${headSha}`,
		"-f",
		`state=${state}`,
		"-f",
		`context=${STATUS_CONTEXT}`,
		"-f",
		`description=${description}`,
	]);
	if (result.exitCode !== 0) {
		console.error(
			`maintainer-review-guard: could not publish the '${STATUS_CONTEXT}' status: ${result.stderr.trim() || result.stdout.trim()}`,
		);
		return false;
	}
	console.log(`maintainer-review-guard: published '${STATUS_CONTEXT}' (${state}) for ${headSha.slice(0, 7)}.`);
	return true;
}

/**
 * Reports the failure and replaces any earlier status on the head commit with
 * a failure, so a stale success cannot keep the gate open.
 */
function abort(message: string): never {
	console.error(`maintainer-review-guard: ${message}`);
	if (publishRequested || dryRun) {
		publishStatus("failure", `Maintainer review: ${message}`.slice(0, 140));
	}
	process.exit(1);
}

// ============================================================
// Inputs
// ============================================================

const pullRequestNumber = readOption("--pr");
if (pullRequestNumber === undefined) fail("--pr requires a pull request number");
if (!/^[0-9]+$/.test(pullRequestNumber)) fail(`--pr must be a number, got "${pullRequestNumber}"`);

const reviewsFile = readOption("--reviews-file");

repo = resolveRepo();
const repoOwner = repo.split("/")[0];
if (repoOwner === undefined || repoOwner.length === 0) fail(`could not derive the maintainer from "${repo}"`);
const maintainer = readOption("--maintainer") ?? repoOwner;

headSha = resolveHeadSha();

function readReviews(): { ok: true; reviews: Review[] } | { ok: false; message: string } {
	if (reviewsFile !== undefined) {
		if (!existsSync(reviewsFile)) return { ok: false, message: `reviews file not found: ${reviewsFile}` };
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(reviewsFile, "utf8"));
		} catch (error) {
			return { ok: false, message: `reviews file is not valid JSON: ${(error as Error).message}` };
		}
		if (!Array.isArray(parsed)) return { ok: false, message: "reviews file must contain a JSON array of reviews" };
		return { ok: true, reviews: parsed as Review[] };
	}
	const result = gh([`repos/${repo}/pulls/${pullRequestNumber}/reviews`, "--paginate"]);
	if (result.exitCode !== 0) {
		return {
			ok: false,
			message: `could not read the pull request reviews: ${result.stderr.trim() || result.stdout.trim()}`,
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch (error) {
		return { ok: false, message: `could not parse the pull request reviews: ${(error as Error).message}` };
	}
	if (!Array.isArray(parsed)) return { ok: false, message: "the pull request reviews response was not an array" };
	return { ok: true, reviews: parsed as Review[] };
}

const read = readReviews();
if (!read.ok) abort(read.message);
const reviews = read.reviews;

// ============================================================
// Verdict
// ============================================================

/**
 * A written maintainer review satisfies the gate when it targets the head
 * commit and carries a body. A review that requested changes blocks instead of
 * satisfying, and dismissed or pending reviews never count.
 */
function evaluateMaintainerReview(allReviews: Review[], head: string, reviewer: string): Verdict {
	const authored = allReviews.filter((review) => review.user?.login === reviewer);
	if (authored.length === 0) {
		return { ok: false, reason: `the pull request has no review by ${reviewer}` };
	}

	const live = authored.filter((review) => !IGNORED_STATES.includes(review.state));
	if (live.length === 0) {
		return { ok: false, reason: `every review by ${reviewer} was dismissed or is still a draft` };
	}

	const blocking = live.find((review) => review.state === "CHANGES_REQUESTED");
	if (blocking !== undefined) {
		return {
			ok: false,
			reason: `${reviewer} requested changes on ${(blocking.commit_id ?? "").slice(0, 7) || "an earlier commit"}`,
		};
	}

	const written = live.filter((review) => (review.body ?? "").trim().length > 0);
	if (written.length === 0) {
		return { ok: false, reason: `the reviews by ${reviewer} carry no written body` };
	}

	const onHead = written.filter(
		(review) => review.commit_id === head && SATISFYING_STATES.includes(review.state),
	);
	if (onHead.length === 0) {
		const targets = live.map((review) => `${review.state}@${(review.commit_id ?? "unknown").slice(0, 7)}`).join(", ");
		return {
			ok: false,
			reason: `no written review by ${reviewer} targets the head commit ${head.slice(0, 7)} (found: ${targets || "none"})`,
		};
	}

	return { ok: true, reason: `written review by ${reviewer} on ${head.slice(0, 7)}` };
}

const verdict = evaluateMaintainerReview(reviews, headSha, maintainer);

// ============================================================
// Report
// ============================================================

if (verdict.ok) {
	console.log(`maintainer-review-guard: OK — ${verdict.reason}.`);
} else {
	console.error(`maintainer-review-guard: FAIL — ${verdict.reason}.`);
}

if (publishRequested || dryRun) {
	const state = verdict.ok ? "success" : "failure";
	const description = verdict.ok
		? `Maintainer review: written review by ${maintainer} on ${headSha.slice(0, 7)}`
		: `Maintainer review: no written review by ${maintainer} on ${headSha.slice(0, 7)}`;
	publishStatus(state, description);
}

process.exit(verdict.ok ? 0 : 1);
