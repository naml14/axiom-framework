import { createApp, defineComponent, h, signal } from '../src/index.js'
import { installDomReadCounter } from '../demo/dom-read-counter.js'

export const SETTINGS = Object.freeze({ cards: 500, columns: 20, width: 396,
  height: 350, warmups: 5, repetitions: 30 })

type Schedule = (callback: () => void) => void
const browserFrame: Schedule = callback => { requestAnimationFrame(callback) }

/** A cyclic permutation moves every card, including card zero, on every step. */
export function workload(frame: number) {
  return {
    cards: Array.from({ length: SETTINGS.cards }, (_, id) => {
      const slot = (id + frame * 17) % SETTINGS.cards
      const column = slot % SETTINGS.columns
      const row = Math.floor(slot / SETTINGS.columns)
      return { id, column, row, x: column * 20, y: row * 14 }
    }),
  }
}

export async function createComparison(a: HTMLElement, b: HTMLElement, schedule: Schedule = browserFrame) {
  const frame = signal(0)
  let pending: Promise<void> = Promise.resolve()
  const scheduler: Schedule = callback => {
    pending = new Promise<void>((resolve, reject) => schedule(() => {
      try { callback(); resolve() } catch (error) { reject(error) }
    }))
  }
  for (const root of [a, b]) {
    root.style.position = 'relative'
    root.style.width = `${SETTINGS.width}px`
    root.style.height = `${SETTINGS.height}px`
  }
  // Reuse the demo's reversible, instance-only instrumentation and its exact scope.
  const counters = [installDomReadCounter(a, window)]
  const reads = {
    total: () => counters.reduce((sum, counter) => sum + counter.total(), 0),
    reset: () => counters.forEach(counter => counter.reset()),
  }
  const component = defineComponent(() => h('div', {
    width: SETTINGS.width, height: SETTINGS.height,
    layout: { display: 'grid', gridTemplateColumns: SETTINGS.columns, gap: 4 },
  }, workload(frame.value).cards.map(card => h('div', {
    class: 'card', key: String(card.id), width: 16, height: 10,
    layout: { gridColumn: card.column + 1, gridRow: card.row + 1 },
  }, String(card.id)))))
  const app = createApp(component, a, {
    scheduler, lineHeight: 10, font: '5px monospace',
    // Fixed single-line labels (0–499), no canvas/font measurement in either arm.
    textEngine: {
      prepare: text => ({ text }),
      layout: () => ({ lineCount: 1, height: 10 }),
      clearCache() {},
    },
  })
  function replace(frame: number) {
    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;width:396px;height:350px;transform:translate(0px,0px) var(--animation-transform,);box-sizing:border-box;padding:0'
    for (const card of workload(frame).cards) {
      const element = document.createElement('div')
      element.className = 'card'
      element.textContent = String(card.id)
      element.style.cssText = `position:absolute;width:16px;height:10px;box-sizing:border-box;padding:0;transform:translate(${card.x}px,${card.y}px) var(--animation-transform,)`
      container.append(element)
    }
    b.replaceChildren(container)
  }
  try {
    app.mount()
    await pending // Mount also queues a dependency-establishing update.
    replace(0)
  } catch (error) {
    app.unmount()
    counters.forEach(counter => counter.dispose())
    throw error
  }
  return {
    reads,
    axiom: { async update(next: number) { frame.value = next; await pending } },
    native: { update(next: number) {
      return new Promise<void>((resolve, reject) => schedule(() => {
        try { replace(next); resolve() } catch (error) { reject(error) }
      }))
    } },
    dispose() {
      app.unmount()
      b.replaceChildren()
      counters.forEach(counter => counter.dispose())
    },
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Only called by the isolated HTML page; importing the workload has no UI effects. */
export function wireBenchmark() {
  const button = document.querySelector<HTMLButtonElement>('#run')!
  const results = document.querySelector<HTMLElement>('#results')!
  button.addEventListener('click', async () => {
    button.disabled = true
    const row = document.createElement('pre')
    row.textContent = 'Ejecutando… mantén esta pestaña visible y no redimensiones.'
    results.append(row) // Keep earlier runs, including their raw samples.
    let comparison: Awaited<ReturnType<typeof createComparison>> | undefined
    try {
      cleanup?.()
      cleanup = undefined
      comparison = await createComparison(document.querySelector<HTMLElement>('#axiom')!,
        document.querySelector<HTMLElement>('#native')!)
      const samples = { axiom: [] as number[], native: [] as number[] }
      const reads = { axiom: 0, native: 0 }
      const probes = { axiom: 0, native: 0 }
      const roots = { axiom: document.querySelector<HTMLElement>('#axiom')!,
        native: document.querySelector<HTMLElement>('#native')! }
      const started = new Date().toISOString()
      for (let step = 1; step <= SETTINGS.warmups + SETTINGS.repetitions; step++) {
        // Alternate first arm to reduce fixed-order bias; identical frame per pair.
        const order = step % 2 ? ['axiom', 'native'] as const : ['native', 'axiom'] as const
        for (const name of order) {
          if (document.hidden) throw new Error('Pestaña oculta: ejecución descartada; repite en primer plano.')
          comparison.reads.reset()
          const start = performance.now()
          await comparison[name].update(step)
          // Explicit layout barrier, not a purported browser reflow counter.
          roots[name].getBoundingClientRect()
          const elapsed = performance.now() - start
          if (step > SETTINGS.warmups) {
            samples[name].push(elapsed)
            reads[name] += comparison.reads.total()
            probes[name]++
          }
        }
      }
      row.textContent = `${started}\n${navigator.userAgent}\n` +
        (['axiom', 'native'] as const).map(name =>
          `${name}: mediana ${median(samples[name]).toFixed(3)} ms/actualización; ` +
          `lecturas raíz/viewport ${reads[name]}; barreras de layout ${probes[name]}; reflows: no disponible\n` +
          `Muestras ms: ${samples[name].map(value => value.toFixed(3)).join(', ')}`
        ).join('\n')
      // Keep both connected final scenes visible; tear down only before the next run.
      cleanup = comparison.dispose
      comparison = undefined
    } catch (error) {
      row.textContent = `Sin resultado válido: ${String(error)}`
    } finally {
      comparison?.dispose()
      button.disabled = false
    }
  })
  let cleanup: (() => void) | undefined
}
