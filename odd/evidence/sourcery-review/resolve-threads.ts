#!/usr/bin/env bun
/**
 * Reply to and resolve the 20 sourcery-ai review threads.
 *
 * Usage:
 *   bun run odd/evidence/sourcery-review/resolve-threads.ts --dry-run
 *   bun run odd/evidence/sourcery-review/resolve-threads.ts --apply
 *
 * The reply body for each thread comes from replies.json (id -> body).
 * A thread is only resolved when its reply was posted successfully.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dir
const REPLIES = join(HERE, 'replies.json')

type Reply = { pr: number; threadId: string; commentId: number; body: string }

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dryRun = args.includes('--dry-run')

if (!apply && !dryRun) {
	console.error('Pass --dry-run to print the plan, or --apply to post and resolve.')
	process.exit(2)
}

const replies = JSON.parse(readFileSync(REPLIES, 'utf8')) as Reply[]

async function gh(args: string[], input?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['gh', ...args], {
		stdin: input === undefined ? 'ignore' : new TextEncoder().encode(input),
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	return { ok: code === 0, stdout, stderr }
}

let posted = 0
let resolved = 0
const failures: string[] = []

for (const reply of replies) {
	if (dryRun) {
		console.log(`--- PR#${reply.pr} thread ${reply.threadId} (comment ${reply.commentId})`)
		console.log(reply.body)
		console.log()
		continue
	}

	// 1. Reply to the review comment.
	const commentResult = await gh(
		[
			'api',
			`repos/naml14/axiom-framework/pulls/${reply.pr}/comments/${reply.commentId}/replies`,
			'-X',
			'POST',
			'-f',
			`body=${reply.body}`,
		],
	)
	if (!commentResult.ok) {
		failures.push(`reply PR#${reply.pr} comment ${reply.commentId}: ${commentResult.stderr.trim()}`)
		continue
	}
	posted++

	// 2. Resolve the thread.
	const threadResult = await gh([
		'api',
		'graphql',
		'-f',
		`query=mutation { resolveReviewThread(input: {threadId: "${reply.threadId}"}) { thread { isResolved } } }`,
	])
	if (!threadResult.ok || threadResult.stdout.includes('"isResolved":false')) {
		failures.push(`resolve PR#${reply.pr} thread ${reply.threadId}: ${threadResult.stderr.trim() || threadResult.stdout.trim()}`)
		continue
	}
	resolved++
}

if (dryRun) {
	console.log(`dry run: ${replies.length} threads would be replied and resolved`)
	process.exit(0)
}

console.log(`posted ${posted} replies, resolved ${resolved} threads`)
if (failures.length > 0) {
	console.error(`\n${failures.length} failures:`)
	for (const failure of failures) console.error(`  - ${failure}`)
	process.exit(1)
}
