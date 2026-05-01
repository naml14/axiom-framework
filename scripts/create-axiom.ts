#!/usr/bin/env bun

// ============================================================
// create-axiom — scaffold a new axiom-framework project
// ============================================================

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, 'templates')

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const projectName = args[0] || 'my-axiom-app'
  const projectDir = join(process.cwd(), projectName)

  console.log(`\n  Creating Axiom project: ${projectName}\n`)

  // Create project directories
  await mkdir(projectDir, { recursive: true })
  await mkdir(join(projectDir, 'src'), { recursive: true })

  // Copy templates
  const templates: Array<[string, string]> = [
    ['package.json', 'package.json'],
    ['tsconfig.json', 'tsconfig.json'],
    ['build-static.ts', 'build-static.ts'],
    ['src/app.ts', 'src/app.ts'],
    ['index.html', 'index.html'],
  ]

  for (const [src, dest] of templates) {
    const content = await readFile(join(TEMPLATES_DIR, src), 'utf8')
    // Replace placeholder project name in package.json
    const final = src === 'package.json'
      ? content.replace('"my-axiom-app"', JSON.stringify(projectName))
      : content
    await writeFile(join(projectDir, dest), final, 'utf8')
    console.log(`  Created ${dest}`)
  }

  console.log(`\n  Installing dependencies...`)
  const install = Bun.spawnSync(['bun', 'install'], { cwd: projectDir, stdout: 'inherit', stderr: 'inherit' })

  if (install.exitCode !== 0) {
    console.error(`  Install failed. Run 'bun install' manually in ${projectDir}`)
  } else {
    console.log(`  Dependencies installed`)
  }

  console.log(`\n  Ready! Run:\n`)
  console.log(`    cd ${projectName}`)
  console.log(`    bun dev\n`)
}

main().catch(err => {
  console.error('Failed to create project:', err)
  process.exit(1)
})
