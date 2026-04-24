// ============================================================
// Benchmark Golden Standard — Fase 0A
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// Este benchmark establece el contrato de no-regresión.
// ANTES de la capa de sintaxis, medimos prepare() con la API literal.
// Ese número es el umbral de CI: la nueva capa no puede ser > 5% más lenta.
//
// Uso:
//   bun run benchmarks/prepare.bench.ts
//
// El resultado se guarda en benchmarks/.golden.json para comparación en CI.
// ============================================================

import { prepare } from '../src/render/prepare.js'
import { defineComponent } from '../src/index.js'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

// ─── Golden Standard: 5000 celdas con API literal ────────────────────────────
const LiteralTable = defineComponent(() => ({
  type: 'element' as const,
  tag: 'table',
  children: Array.from({ length: 5000 }, (_, i) => ({
    type: 'element' as const,
    tag: 'tr',
    children: [{
      type: 'element' as const,
      tag: 'td',
      children: [{ type: 'text' as const, content: String(i) }],
    }],
  })),
}))

// ─── Medición manual con Bun.nanoseconds() ────────────────────────────────────
const WARMUP_ITERATIONS   = 10
const MEASURE_ITERATIONS  = 100

// Warm up — permite al JIT optimizar antes de medir
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
  prepare(LiteralTable, undefined)
}

// Medición real
const times: number[] = []
for (let i = 0; i < MEASURE_ITERATIONS; i++) {
  const start = performance.now()
  prepare(LiteralTable, undefined)
  const end = performance.now()
  times.push(end - start)
}

// Estadísticas
times.sort((a, b) => a - b)
const mean   = times.reduce((s, t) => s + t, 0) / times.length
const median = times[Math.floor(times.length / 2)]!
const p95    = times[Math.floor(times.length * 0.95)]!
const min    = times[0]!
const max    = times[times.length - 1]!

const result = {
  benchmark:   'prepare() — API literal (Golden Standard)',
  date:        new Date().toISOString(),
  iterations:  MEASURE_ITERATIONS,
  nodeCount:   5000,
  ms: { mean, median, p95, min, max },
}

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║   Axiom — Benchmark Golden Standard (prepare)           ║')
console.log('╚══════════════════════════════════════════════════════════╝')
console.log(`\nFecha:      ${result.date}`)
console.log(`Nodos:      ${result.nodeCount.toLocaleString()}`)
console.log(`Iteraciones: ${result.iterations}`)
console.log('\nResultados (ms):')
console.log(`  mean:   ${mean.toFixed(3)}`)
console.log(`  median: ${median.toFixed(3)}`)
console.log(`  p95:    ${p95.toFixed(3)}`)
console.log(`  min:    ${min.toFixed(3)}`)
console.log(`  max:    ${max.toFixed(3)}`)

// ─── Comparación con golden guardado ─────────────────────────────────────────
// En Windows, pathname empieza con /D:/ — lo normalizamos
const rawPath    = new URL('./.golden.json', import.meta.url).pathname
const goldenPath = process.platform === 'win32' ? rawPath.slice(1) : rawPath

if (existsSync(goldenPath)) {
  const golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as typeof result
  const regressionPct = ((mean - golden.ms.mean) / golden.ms.mean) * 100

  console.log(`\n📊 vs Golden (${golden.date.slice(0, 10)}):`)
  console.log(`  golden mean: ${golden.ms.mean.toFixed(3)} ms`)
  console.log(`  actual mean: ${mean.toFixed(3)} ms`)
  console.log(`  delta:       ${regressionPct > 0 ? '+' : ''}${regressionPct.toFixed(1)}%`)

  if (regressionPct > 5) {
    console.error('\n❌ REGRESIÓN DETECTADA — delta > 5%. Revisar antes de merge.')
    process.exit(1)
  } else if (regressionPct > 0) {
    console.log('\n⚠️  Ligera regresión (< 5%) — dentro del umbral aceptable.')
  } else {
    console.log('\n✅ Sin regresión — el rendimiento es igual o mejor.')
  }
} else {
  // Primera ejecución — guardar como golden
  writeFileSync(goldenPath, JSON.stringify(result, null, 2))
  console.log(`\n✅ Golden Standard guardado en benchmarks/.golden.json`)
  console.log('   Próximas ejecuciones compararán contra este número.')
}

console.log()
