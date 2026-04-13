import { createApp, defineComponent } from '../src/index.js'
import type { App, AppErrorContext, ProfileEvent } from '../src/index.js'

interface DxShowcaseDeps {
  app: App
}

interface DevHookWindow extends Window {
  __AXIOM__?: {
    version: string
    mounted: boolean
    metrics: {
      prepareMs: number
      reflowMs: number
      commitMs: number
    }
    profiling: {
      enabled: boolean
      cycle: number
      subscriberCount: number
    }
  }
}

export function initDxShowcase(deps: DxShowcaseDeps): void {
  const { app } = deps

  const profilingBtn = document.getElementById('dx-profiling-btn') as HTMLButtonElement
  const hotReloadBtn = document.getElementById('dx-hotreload-btn') as HTMLButtonElement
  const devHookRefreshBtn = document.getElementById('dx-devhook-refresh') as HTMLButtonElement
  const errorTestBtn = document.getElementById('dx-error-test') as HTMLButtonElement

  const profileOrder = document.getElementById('dx-profile-order') as HTMLElement
  const devHookOutput = document.getElementById('dx-devhook-output') as HTMLElement
  const errorOutput = document.getElementById('dx-error-output') as HTMLElement

  let profilingEnabled = true
  let hotReloadEnabled = false
  let unsubscribeProfiling: (() => void) | null = null

  const cycleEvents = new Map<number, ProfileEvent[]>()

  function setProfileSummary(event: ProfileEvent): void {
    const events = cycleEvents.get(event.cycle) ?? []
    events.push(event)
    cycleEvents.set(event.cycle, events)

    const ordered = ['prepare', 'reflow', 'commit', 'total'] as const
    const hasAll = ordered.every((phase) => events.some((e) => e.phase === phase))

    const eventOrder = events.map((e) => e.phase).join(' → ')
    const total = events
      .filter((e) => e.phase !== 'total')
      .reduce((acc, curr) => acc + curr.durationMs, 0)

    if (hasAll) {
      profileOrder.textContent = `cycle #${event.cycle}: ${eventOrder} | total observado=${total.toFixed(2)}ms`
      for (const [cycle] of cycleEvents) {
        if (cycle < event.cycle - 4) cycleEvents.delete(cycle)
      }
    } else {
      profileOrder.textContent = `cycle #${event.cycle}: ${eventOrder}`
    }
  }

  function attachProfiling(): void {
    unsubscribeProfiling?.()
    unsubscribeProfiling = app.enableProfiling((event) => {
      setProfileSummary(event)
    })
  }

  function detachProfiling(): void {
    unsubscribeProfiling?.()
    unsubscribeProfiling = null
  }

  function refreshDevHookSnapshot(): void {
    const hook = (window as DevHookWindow).__AXIOM__
    if (hook === undefined) {
      devHookOutput.textContent = 'window.__AXIOM__ no disponible (modo no-dev o app no montada).'
      return
    }

    const beforeVersion = hook.version
    let immutable = true
    try {
      ;(hook as { version: string }).version = 'mutated'
    } catch {
      immutable = true
    }
    immutable = immutable && hook.version === beforeVersion

    devHookOutput.textContent = JSON.stringify(
      {
        version: hook.version,
        mounted: hook.mounted,
        profiling: hook.profiling,
        metrics: hook.metrics,
        immutable,
      },
      null,
      2
    )
  }

  function runErrorContextProbe(): void {
    const scratch = document.createElement('div')

    let captured: { error: string; context: AppErrorContext } | null = null

    const ThrowingProbe = defineComponent(() => {
      throw new Error('DX probe: forced render error')
    })

    const probeApp = createApp(ThrowingProbe, scratch, {
      onError: (err, context) => {
        captured = {
          error: err instanceof Error ? err.message : String(err),
          context,
        }
      },
    })

    try {
      probeApp.mount()
    } catch {
      // Expected path for demonstration
    } finally {
      probeApp.unmount()
    }

    if (captured === null) {
      errorOutput.textContent = 'No se capturó contexto de error.'
      return
    }

    errorOutput.textContent = JSON.stringify(captured, null, 2)
  }

  profilingBtn.addEventListener('click', () => {
    profilingEnabled = !profilingEnabled
    profilingBtn.classList.toggle('active', profilingEnabled)
    profilingBtn.textContent = profilingEnabled ? '📈 Profiling: ON' : '📈 Profiling: OFF'

    if (profilingEnabled) {
      attachProfiling()
    } else {
      detachProfiling()
      profileOrder.textContent = 'Profiling detenido.'
    }

    refreshDevHookSnapshot()
  })

  hotReloadBtn.addEventListener('click', () => {
    hotReloadEnabled = !hotReloadEnabled
    hotReloadBtn.classList.toggle('active', hotReloadEnabled)
    hotReloadBtn.textContent = hotReloadEnabled
      ? '♻️ Hot Reload Recovery: ON'
      : '♻️ Hot Reload Recovery: OFF'

    if (hotReloadEnabled) {
      app.enableHotReloadRecovery()
    } else {
      app.disableHotReloadRecovery()
    }
  })

  devHookRefreshBtn.addEventListener('click', () => {
    refreshDevHookSnapshot()
  })

  errorTestBtn.addEventListener('click', () => {
    runErrorContextProbe()
  })

  attachProfiling()
  refreshDevHookSnapshot()
}
