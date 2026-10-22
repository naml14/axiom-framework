#!/usr/bin/env bun
/**
 * Validate that replies.json matches the live GitHub review threads:
 * every thread in every PR has exactly one reply, and every reply points at
 * a real thread whose comment id matches.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dir
type Reply = { pr: number; threadId: string; commentId: number; body: string }
const replies = JSON.parse(readFileSync(join(HERE, 'replies.json'), 'utf8')) as Reply[]

async function gh(query: string, pr: number): Promise<string> {
	const proc = Bun.spawn(
		['gh', 'api', 'graphql', '-f', `query=${query}`, '-F', 'owner=naml14', '-F', 'repo=axiom-framework', '-F', `pr=${pr}`],
		{ stdout: 'pipe', stderr: 'pipe' },
	)
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	if (code !== 0) throw new Error(`gh failed for PR#${pr}: ${stderr}`)
	return stdout
}

const query = `query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50) {
        nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
      }
    }
  }
}`

let problems = 0
for (const pr of [120, 121, 122, 123]) {
	const raw = await gh(query, pr)
	const data = JSON.parse(raw) as {
		data: { repository: { pullRequest: { reviewThreads: { nodes: Array<{ id: string; isResolved: boolean; comments: { nodes: Array<{ databaseId: number }> } }> } } } }
	}
	const threads = data.data.repository.pullRequest.reviewThreads.nodes
	const byId = new Map(threads.map(t => [t.id, t]))
	const mine = replies.filter(r => r.pr === pr)
	console.log(`PR#${pr}: ${threads.length} hilos en GitHub, ${mine.length} respuestas preparadas`)

	for (const reply of mine) {
		const thread = byId.get(reply.threadId)
		if (thread === undefined) {
			console.error(`  ERROR threadId inexistente: ${reply.threadId}`)
			problems++
			continue
		}
		const commentId = thread.comments.nodes[0]?.databaseId
		if (commentId !== reply.commentId) {
			console.error(`  ERROR commentId desajustado en ${reply.threadId}: API=${commentId} local=${reply.commentId}`)
			problems++
		}
		if (reply.body.trim().length < 80) {
			console.error(`  ERROR respuesta demasiado corta para ${reply.threadId}`)
			problems++
		}
	}
	for (const thread of threads) {
		if (!mine.some(r => r.threadId === thread.id)) {
			console.error(`  ERROR hilo sin respuesta: ${thread.id} (comment ${thread.comments.nodes[0]?.databaseId})`)
			problems++
		}
	}
}

if (problems > 0) {
	console.error(`\n${problems} problemas`)
	process.exit(1)
}
console.log('\ntodos los hilos tienen respuesta coherente con la API')
