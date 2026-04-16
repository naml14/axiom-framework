const COVERAGE_THRESHOLD = 85
const COVERAGE_COMMAND = ['bun', 'test', '--coverage']

type CoverageFailureKind =
  | 'test-failure'
  | 'coverage-format-failure'
  | 'coverage-threshold-failure'

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function parseLineCoverage(output: string): number | null {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const allFilesLine = [...lines].reverse().find((line) => line.includes('All files'))
  if (!allFilesLine) {
    return null
  }

  const normalized = allFilesLine
    .replace(/[│┃]/g, '|')
    .replace(/\s+/g, ' ')
    .trim()

  const columns = normalized
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (columns.length >= 3) {
    const lineCoverage = Number(columns[2])
    if (Number.isFinite(lineCoverage)) {
      return lineCoverage
    }
  }

  const fallbackMatch = normalized.match(/All files\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/)
  if (!fallbackMatch) {
    return null
  }

  const lineCoverage = Number(fallbackMatch[2])
  return Number.isFinite(lineCoverage) ? lineCoverage : null
}

function printFailure(kind: CoverageFailureKind, message: string): never {
  console.error(`\n[coverage gate] FAIL ${kind}: ${message}`)
  process.exit(1)
}

const child = Bun.spawn(COVERAGE_COMMAND, {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
})

const [stdoutText, stderrText, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
])

if (stdoutText.length > 0) {
  process.stdout.write(stdoutText)
}

if (stderrText.length > 0) {
  process.stderr.write(stderrText)
}

const combinedOutput = [stdoutText, stderrText].filter(Boolean).join('\n')
const lineCoverage = parseLineCoverage(combinedOutput)
const thresholdLabel = `${COVERAGE_THRESHOLD.toFixed(2)}%`
const observedLabel = lineCoverage === null ? 'unavailable' : `${lineCoverage.toFixed(2)}%`

if (exitCode !== 0) {
  printFailure(
    'test-failure',
    `\`bun test --coverage\` exited with code ${exitCode}. Threshold ${thresholdLabel} was not evaluated because the test suite did not pass. Observed line coverage: ${observedLabel}.`,
  )
}

if (lineCoverage === null) {
  printFailure(
    'coverage-format-failure',
    `Could not parse the final \`All files\` / \`% Lines\` row from Bun coverage output. Threshold ${thresholdLabel}.`,
  )
}

if (lineCoverage < COVERAGE_THRESHOLD) {
  printFailure(
    'coverage-threshold-failure',
    `Line coverage ${lineCoverage.toFixed(2)}% is below required threshold ${thresholdLabel}.`,
  )
}

console.log(
  `\n[coverage gate] PASS line coverage ${lineCoverage.toFixed(2)}% meets required threshold ${thresholdLabel}.`,
)
