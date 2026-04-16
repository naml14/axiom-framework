#!/usr/bin/env bun
/**
 * API Stability Validation Script
 * 
 * Validates that all public exports have proper JSDoc stability tags.
 * Used in CI to enforce API stability contract.
 * 
 * Usage:
 *   bun run validate:api [options]
 * 
 * Options:
 *   --help               Show this help message
 *   --debug              Show debug information
 *   --strict             Treat warnings as errors
 *   --format json        Output JSON instead of human-readable
 *   --generate-docs      Generate docs/STABILITY.md from tags
 * 
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 */

import { Project, Node, type ExportDeclaration } from 'ts-morph'
import { resolve, normalize } from 'node:path'
import { writeFileSync } from 'node:fs'

// ============================================================
// Types
// ============================================================

type StabilityTier = 'stable' | 'beta' | 'experimental' | 'internal'

const API_CONTRACT_VERSION = '1.0.0'

interface ExportInfo {
  name: string
  filePath: string
  line: number
  stability?: StabilityTier
  since?: string
  deprecated?: boolean
  deprecationMessage?: string
  hasMultipleTags: boolean
  sourceFile: string
}

interface ValidationError {
  type: 'error' | 'warning'
  file: string
  line: number
  export: string
  message: string
  suggestion?: string
}

interface ValidationReport {
  totalExports: number
  stable: number
  beta: number
  experimental: number
  internal: number
  deprecated: number
  untagged: number
  errors: ValidationError[]
  warnings: ValidationError[]
  exports: ExportInfo[]
}

// ============================================================
// CLI Arguments
// ============================================================

const args = process.argv.slice(2)
const showHelp = args.includes('--help')
const debug = args.includes('--debug')
const strict = args.includes('--strict')
const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json'
const generateDocs = args.includes('--generate-docs')

if (showHelp) {
  console.log(`
API Stability Validation Script

Usage:
  bun run validate:api [options]

Options:
  --help               Show this help message
  --debug              Show debug information
  --strict             Treat warnings as errors
  --format json        Output JSON instead of human-readable
  --generate-docs      Generate docs/STABILITY.md from tags

Exit codes:
  0 - All validations passed
  1 - Validation errors found
`)
  process.exit(0)
}

// ============================================================
// Validation Logic
// ============================================================

const STABILITY_TAGS: StabilityTier[] = ['stable', 'beta', 'experimental', 'internal']

/**
 * Helper to detect if a file path is a public entry point (src/index.ts or src/testing.ts).
 * Cross-platform compatible (works on Windows, Linux, macOS).
 * Restricted to exactly the two documented public surface files.
 */
function isPublicEntry(filePath: string): boolean {
  const normalized = normalize(filePath).replace(/\\/g, '/')
  return (
    normalized.endsWith('src/index.ts') ||
    normalized.endsWith('src/testing.ts')
  )
}

function extractStabilityTag(jsDoc: string | undefined): {
  stability?: StabilityTier
  hasMultiple: boolean
  since?: string
  deprecated?: boolean
  deprecationMessage?: string
} {
  if (!jsDoc) {
    return { hasMultiple: false }
  }

  const stabilityTags = STABILITY_TAGS.filter(tag => jsDoc.includes(`@${tag}`))
  const hasMultiple = stabilityTags.length > 1
  const stability = stabilityTags[0]

  // Extract @since
  const sinceMatch = jsDoc.match(/@since\s+v?(\d+\.\d+\.\d+)/)
  const since = sinceMatch ? sinceMatch[1] : undefined

  // Extract @deprecated
  const deprecatedMatch = jsDoc.match(/@deprecated(?:\s+(.+))?/)
  const deprecated = !!deprecatedMatch
  const deprecationMessage = deprecatedMatch?.[1]?.trim()

  return { stability, hasMultiple, since, deprecated, deprecationMessage }
}

function getExportsFromFile(project: Project, filePath: string): ExportInfo[] {
  const sourceFile = project.getSourceFile(filePath)
  if (!sourceFile) {
    console.error(`❌ Could not load file: ${filePath}`)
    return []
  }

  const exports: ExportInfo[] = []

  // Handle re-exports (export { X } from './module')
  sourceFile.getExportDeclarations().forEach((exportDecl: ExportDeclaration) => {
    const moduleSpecifier = exportDecl.getModuleSpecifierValue()
    if (!moduleSpecifier) return

    exportDecl.getNamedExports().forEach(namedExport => {
      const name = namedExport.getName()
      const jsDoc = namedExport.getLeadingCommentRanges()
        .map(range => sourceFile.getFullText().substring(range.getPos(), range.getEnd()))
        .join('\n')

      let { stability, hasMultiple, since, deprecated, deprecationMessage } = extractStabilityTag(jsDoc)

      // v1.0 contract: public surface defaults to stable unless explicitly tagged.
      if (!stability && isPublicEntry(filePath)) {
        stability = 'stable'
        since = API_CONTRACT_VERSION
      }

      exports.push({
        name,
        filePath,
        line: namedExport.getStartLineNumber(),
        stability,
        since,
        deprecated,
        deprecationMessage,
        hasMultipleTags: hasMultiple,
        sourceFile: moduleSpecifier,
      })
    })

    // Handle export * as ns from './module'
    // Only try to get namespace export if it exists
    const namespaceExport = exportDecl.getNamespaceExport?.()
    if (namespaceExport) {
      const name = namespaceExport.getName()
      const jsDoc = exportDecl.getLeadingCommentRanges()
        .map(range => sourceFile.getFullText().substring(range.getPos(), range.getEnd()))
        .join('\n')

      let { stability, hasMultiple, since, deprecated, deprecationMessage } = extractStabilityTag(jsDoc)

      // v1.0 contract: public surface defaults to stable unless explicitly tagged.
      if (!stability && isPublicEntry(filePath)) {
        stability = 'stable'
        since = API_CONTRACT_VERSION
      }

      exports.push({
        name,
        filePath,
        line: exportDecl.getStartLineNumber(),
        stability,
        since,
        deprecated,
        deprecationMessage,
        hasMultipleTags: hasMultiple,
        sourceFile: moduleSpecifier,
      })
    }
  })

  // Handle direct exports (export function X() {})
  sourceFile.getStatements().forEach(statement => {
    if (Node.isExportable(statement) && statement.hasExportKeyword()) {
      let name = ''
      let jsDoc = ''

      if (Node.isFunctionDeclaration(statement)) {
        name = statement.getName() || ''
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      } else if (Node.isVariableStatement(statement)) {
        const decl = statement.getDeclarations()[0]
        name = decl?.getName() || ''
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      } else if (Node.isClassDeclaration(statement)) {
        name = statement.getName() || ''
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      } else if (Node.isInterfaceDeclaration(statement)) {
        name = statement.getName()
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      } else if (Node.isTypeAliasDeclaration(statement)) {
        name = statement.getName()
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      } else if (Node.isEnumDeclaration(statement)) {
        name = statement.getName()
        jsDoc = statement.getJsDocs().map(doc => doc.getText()).join('\n')
      }

      if (name) {
        let { stability, hasMultiple, since, deprecated, deprecationMessage } = extractStabilityTag(jsDoc)

        // v1.0 contract: public surface defaults to stable unless explicitly tagged.
        if (!stability && isPublicEntry(filePath)) {
          stability = 'stable'
          since = API_CONTRACT_VERSION
        }

        exports.push({
          name,
          filePath,
          line: statement.getStartLineNumber(),
          stability,
          since,
          deprecated,
          deprecationMessage,
          hasMultipleTags: hasMultiple,
          sourceFile: filePath,
        })
      }
    }
  })

  return exports
}

function validateExports(exports: ExportInfo[]): ValidationError[] {
  const errors: ValidationError[] = []

  exports.forEach(exp => {
    // Rule 1: Missing stability tag
    if (!exp.stability) {
      errors.push({
        type: 'error',
        file: exp.filePath,
        line: exp.line,
        export: exp.name,
        message: `Missing stability tag`,
        suggestion: `Add JSDoc comment with @stable, @beta, or @experimental`,
      })
    }

    // Rule 2: Multiple stability tags
    if (exp.hasMultipleTags) {
      errors.push({
        type: 'error',
        file: exp.filePath,
        line: exp.line,
        export: exp.name,
        message: `Multiple stability tags found`,
        suggestion: `Use only one of: @stable, @beta, @experimental, @internal`,
      })
    }

    // Rule 3: @stable or @beta requires @since
    if ((exp.stability === 'stable' || exp.stability === 'beta') && !exp.since) {
      errors.push({
        type: 'error',
        file: exp.filePath,
        line: exp.line,
        export: exp.name,
        message: `@${exp.stability} requires @since tag`,
        suggestion: `Add @since v1.0.0 (or appropriate version)`,
      })
    }

    // Rule 4: @internal in public API (applies to ALL public entry points)
    if (exp.stability === 'internal' && isPublicEntry(exp.filePath)) {
      errors.push({
        type: 'error',
        file: exp.filePath,
        line: exp.line,
        export: exp.name,
        message: `@internal exports should not be in public API (${exp.filePath})`,
        suggestion: `Remove from public entry file or change to @experimental`,
      })
    }

    // Rule 5: Invalid tag name (typos)
    if (exp.stability && !STABILITY_TAGS.includes(exp.stability)) {
      errors.push({
        type: 'error',
        file: exp.filePath,
        line: exp.line,
        export: exp.name,
        message: `Invalid stability tag: @${exp.stability}`,
        suggestion: `Use one of: ${STABILITY_TAGS.join(', ')}`,
      })
    }
  })

  return errors
}

/**
 * Checks that no public entry point uses bare `export * from './foo'`.
 * Bare re-exports bypass stability tag checks — all public APIs must be named.
 */
function checkBareStarExports(project: Project, entryPoints: string[]): ValidationError[] {
  const errors: ValidationError[] = []
  for (const filePath of entryPoints) {
    const sourceFile = project.getSourceFile(filePath)
    if (!sourceFile) continue
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue()
      if (!moduleSpecifier) continue
      const hasNamed = exportDecl.getNamedExports().length > 0
      const hasNamespace = !!exportDecl.getNamespaceExport?.()
      if (!hasNamed && !hasNamespace) {
        errors.push({
          type: 'error',
          file: filePath,
          line: exportDecl.getStartLineNumber(),
          export: `export * from '${moduleSpecifier}'`,
          message: `Bare 'export * from' in public entry point bypasses stability tag checks`,
          suggestion: `Use named exports: export { Foo, Bar } from '${moduleSpecifier}'`,
        })
      }
    }
  }
  return errors
}

function generateReport(exports: ExportInfo[], errors: ValidationError[]): ValidationReport {
  const stats = {
    stable: exports.filter(e => e.stability === 'stable').length,
    beta: exports.filter(e => e.stability === 'beta').length,
    experimental: exports.filter(e => e.stability === 'experimental').length,
    internal: exports.filter(e => e.stability === 'internal').length,
    deprecated: exports.filter(e => e.deprecated).length,
    untagged: exports.filter(e => !e.stability).length,
  }

  return {
    totalExports: exports.length,
    ...stats,
    errors: errors.filter(e => e.type === 'error'),
    warnings: errors.filter(e => e.type === 'warning'),
    exports,
  }
}

function printReport(report: ValidationReport) {
  if (formatJson) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('\n📊 API Stability Report\n')
  console.log(`Total exports: ${report.totalExports}`)
  console.log(`🟢 Stable:       ${report.stable}`)
  console.log(`🟡 Beta:         ${report.beta}`)
  console.log(`🟡 Experimental: ${report.experimental}`)
  console.log(`⚫ Internal:     ${report.internal}`)
  console.log(`❌ Untagged:     ${report.untagged}`)
  console.log(`⚠️  Deprecated:  ${report.deprecated}`)

  if (debug) {
    console.log('\n🔍 All Exports:\n')
    report.exports.forEach(exp => {
      const icon = exp.stability === 'stable' ? '🟢' : 
                   exp.stability === 'beta' ? '🟡' : 
                   exp.stability === 'experimental' ? '🟡' :
                   exp.stability === 'internal' ? '⚫' : '❓'
      console.log(`  ${icon} ${exp.name} — @${exp.stability || 'untagged'}${exp.since ? ` (since v${exp.since})` : ''}`)
    })
  }

  if (report.errors.length > 0) {
    console.log('\n❌ Errors:\n')
    report.errors.forEach(err => {
      console.log(`  ${err.file}:${err.line}`)
      console.log(`    Export: ${err.export}`)
      console.log(`    Error: ${err.message}`)
      if (err.suggestion) {
        console.log(`    Suggestion: ${err.suggestion}`)
      }
      console.log('')
    })
  }

  if (report.warnings.length > 0) {
    console.log('\n⚠️  Warnings:\n')
    report.warnings.forEach(warn => {
      console.log(`  ${warn.file}:${warn.line}`)
      console.log(`    Export: ${warn.export}`)
      console.log(`    Warning: ${warn.message}`)
      if (warn.suggestion) {
        console.log(`    Suggestion: ${warn.suggestion}`)
      }
      console.log('')
    })
  }

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log('\n✅ All validations passed!\n')
  }
}

function generateStabilityDoc(report: ValidationReport) {
  const stable = report.exports.filter(e => e.stability === 'stable')
  const beta = report.exports.filter(e => e.stability === 'beta')
  const experimental = report.exports.filter(e => e.stability === 'experimental')

  // Helper to normalize sourceFile to repo-relative POSIX paths
  const normalizePath = (sourcePath: string): string => {
    let normalized = normalize(sourcePath).replace(/\\/g, '/')
    // Remove .js extension if present
    if (normalized.endsWith('.js')) {
      normalized = normalized.slice(0, -3)
    }
    
    // Extract module specifier from /src/ paths
    if (normalized.includes('/src/')) {
      const match = normalized.match(/\/src\/(.*?)$/)
      const modulePath = match ? (match[1] as string) : null
      if (modulePath) {
        return modulePath.startsWith('.') ? modulePath : `./${modulePath}`
      }
    }
    // If already has ./ prefix, keep it
    if (normalized.startsWith('./')) {
      return normalized
    }
    // Otherwise add ./ if it looks like a relative path (no drive letter or absolute path)
    if (!normalized.includes(':') && !normalized.startsWith('/')) {
      return `./${normalized}`
    }
    // Fallback
    return normalized
  }

  const stableRows = stable
    .map(e => `| ${e.name} | ${normalizePath(e.sourceFile)} | v${e.since || API_CONTRACT_VERSION} |`)
    .join('\n')
  const betaRows = beta
    .map(e => `| ${e.name} | ${normalizePath(e.sourceFile)} | v${e.since || API_CONTRACT_VERSION} |`)
    .join('\n')
  const experimentalRows = experimental
    .map(e => `| ${e.name} | ${normalizePath(e.sourceFile)} |`)
    .join('\n')

  const content = `# API Stability Contract

Version: ${API_CONTRACT_VERSION}
Last Updated: ${new Date().toISOString().split('T')[0]}

## Public Surface

This contract applies to exports from src/index.ts and src/testing.ts.

For v1.0.0 kickoff, untagged public exports are treated as stable since v${API_CONTRACT_VERSION}.

## Stable APIs (${stable.length})

| Export | Module | Since |
|--------|--------|-------|
${stableRows || '| (none) | - | - |'}

## Beta APIs (${beta.length})

| Export | Module | Since |
|--------|--------|-------|
${betaRows || '| (none) | - | - |'}

## Experimental APIs (${experimental.length})

| Export | Module |
|--------|--------|
${experimentalRows || '| (none) | - |'}

## Enforcement

- Run: bun run validate:api
- CI should fail on validation errors.
`

  const outputPath = resolve(process.cwd(), 'docs', 'STABILITY.md')
  writeFileSync(outputPath, content, 'utf-8')
  console.log(`\n✅ Generated: ${outputPath}\n`)
}

// ============================================================
// Main
// ============================================================

async function main() {
  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  })

  // Load main public API
  const indexPath = resolve(process.cwd(), 'src', 'index.ts')
  const testingPath = resolve(process.cwd(), 'src', 'testing.ts')

  const indexExports = getExportsFromFile(project, indexPath)
  const testingExports = getExportsFromFile(project, testingPath)

  const allExports = [...indexExports, ...testingExports]

  if (debug) {
    console.log(`\n🔍 Found ${allExports.length} total exports`)
    console.log(`  - ${indexExports.length} from src/index.ts`)
    console.log(`  - ${testingExports.length} from src/testing.ts\n`)
  }

  const errors = validateExports(allExports)
  const bareStarErrors = checkBareStarExports(project, [indexPath, testingPath])
  const report = generateReport(allExports, [...errors, ...bareStarErrors])

  printReport(report)

  if (generateDocs) {
    generateStabilityDoc(report)
  }

  const hasErrors = report.errors.length > 0
  const hasWarnings = report.warnings.length > 0

  if (hasErrors || (strict && hasWarnings)) {
    process.exit(1)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('❌ Validation script crashed:', err)
  process.exit(1)
})
