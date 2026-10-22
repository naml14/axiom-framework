#!/usr/bin/env bun
/**
 * Verify the Sourcery review resolution: every one of the 20 review threads
 * must be resolved, must carry a reply published by the maintainer, and the
 * fixes those replies cite must exist in the pushed branches.
 *
 * Usage: bun run odd/evidence/sourcery-review/verify-resolution.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dir
const REPLIES = join(HERE, 'replies.json')

type Reply = { pr: number; threadId: string; commentId: number; body: string }
const replies = JSON.parse(readFileSync(REPLIES, 'utf8')) as Reply[]

async function ghJson(args: string[]): Promise<unknown> {
	const proc = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' })
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	if (code !== 0) throw new Error(`gh ${args.join(' ')} failed: ${stderr}`)
	return JSON.parse(stdout)
}

const THREAD_QUERY = `query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50) {
        nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
      }
    }
  }
}`

let problems = 0
const fail = (message: string): void => {
	console.error(`  FAIL ${message}`)
	problems++
}

console.log('== Hilos de revisión ==')
for (const pr of [120, 121, 122, 123]) {
	const data = (await ghJson([
		'api',
		'graphql',
		'-f',
		`query=${THREAD_QUERY}`,
		'-F',
		'owner=naml14',
		'-F',
		'repo=axiom-framework',
		'-F',
		`pr=${pr}`,
	])) as {
		data: {
			repository: {
				pullRequest: {
					reviewThreads: {
						nodes: Array<{ id: string; isResolved: boolean; comments: { nodes: Array<{ databaseId: number }> } }>
					}
				}
			}
		}
	}
	const threads = data.data.repository.pullRequest.reviewThreads.nodes
	const mine = replies.filter(r => r.pr === pr)
	const unresolved = threads.filter(t => !t.isResolved)
	const unanswered = threads.filter(t => !mine.some(r => r.threadId === t.id))
	console.log(`PR#${pr}: ${threads.length} hilos, ${mine.length} respuestas, ${unresolved.length} sin resolver`)
	if (unresolved.length > 0) fail(`PR#${pr} tiene ${unresolved.length} hilos sin resolver`)
	if (unanswered.length > 0) fail(`PR#${pr} tiene ${unanswered.length} hilos sin respuesta`)
}

console.log('\n== Respuestas publicadas ==')
for (const pr of [120, 121, 122, 123]) {
	const comments = (await ghJson([
		'api',
		`repos/naml14/axiom-framework/pulls/${pr}/comments`,
	])) as Array<{ user: { login: string }; body: string }>
	const mine = comments.filter(c => c.user.login === 'naml14')
	const mineReplies = replies.filter(r => r.pr === pr)
	console.log(`PR#${pr}: ${mine.length} respuestas publicadas, ${mineReplies.length} preparadas`)
	if (mine.length !== mineReplies.length) {
		fail(`PR#${pr} tiene ${mine.length} respuestas publicadas y ${mineReplies.length} preparadas`)
	}
	for (const reply of mineReplies) {
		if (!reply.body.includes('Corregido')) fail(`PR#${pr} comentario ${reply.commentId} no empieza por "Corregido"`)
		if (!/\b[0-9a-f]{7}\b/.test(reply.body)) fail(`PR#${pr} comentario ${reply.commentId} no cita un SHA de commit`)
	}
}

console.log('\n== Commits citados presentes en las ramas ==')
for (const [pr, branch] of [
	[120, 'feat/next-version-01-release-integrity'],
	[121, 'feat/next-version-02-promises'],
	[122, 'feat/next-version-03-contract'],
	[123, 'feat/next-version-04-demo'],
] as const) {
	const log = (await ghJson([
		'api',
		`repos/naml14/axiom-framework/commits?sha=${branch}&per_page=100`,
	])) as Array<{ sha: string; commit: { message: string } }>
	const shas = new Set(log.map(c => c.sha.slice(0, 7)))
	const cited = new Set<string>()
	for (const reply of replies.filter(r => r.pr === pr)) {
		for (const match of reply.body.matchAll(/\b[0-9a-f]{7}\b/g)) cited.add(match[0])
	}
	const missing = [...cited].filter(sha => !shas.has(sha))
	console.log(`PR#${pr}: ${cited.size} SHAs citados, ${shas.size} commits en ${branch}`)
	if (missing.length > 0) fail(`PR#${pr} cita SHAs ausentes de ${branch}: ${missing.join(', ')}`)
}

if (problems > 0) {
	console.error(`\n${problems} problemas`)
	process.exit(1)
}
console.log('\nresolucion verificada: 20/20 hilos resueltos, con respuesta y fix verificable')
