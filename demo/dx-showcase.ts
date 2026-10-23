import { createApp, defineComponent, signal } from '../src/index.ts'
import { wireShowcase } from './wire-showcase.ts'
import type { App, AppErrorContext, ProfileEvent } from '../src/index.ts'

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

export function initDxShowcase(deps: DxShowcaseDeps): () => void {
  const { app } = deps

  // These buttons (dx-profiling-btn, dx-hotreload-btn, etc.) are static HTML elements
  // declared in static.html — outside Axiom's rendered tree. addEventListener is the
  // correct "browser-level integration" pattern for controls that live outside Axiom.
  // Axiom-owned elements use `on: { click: handler }` declared inside defineComponent.
  const profilingBtn = document.getElementById('dx-profiling-btn') as HTMLButtonElement
  const hotReloadBtn = document.getElementById('dx-hotreload-btn') as HTMLButtonElement
  const devHookRefreshBtn = document.getElementById('dx-devhook-refresh') as HTMLButtonElement
  const errorTestBtn = document.getElementById('dx-error-test') as HTMLButtonElement

  const profileOrder = document.getElementById('dx-profile-order') as HTMLElement
  const devHookOutput = document.getElementById('dx-devhook-output') as HTMLElement
  const errorOutput = document.getElementById('dx-error-output') as HTMLElement

  const profilingEnabled = signal(true)
  const hotReload = signal({ enabled: false, text: hotReloadBtn.textContent })
  // Runtime callbacks and explicit refresh actions bridge non-signal APIs.
  const profileText = signal(profileOrder.textContent)
  const devHookText = signal(devHookOutput.textContent)
  const errorText = signal(errorOutput.textContent)
  const stop = wireShowcase(() => {
    profileOrder.textContent = profileText.value
    devHookOutput.textContent = devHookText.value
    errorOutput.textContent = errorText.value
    profilingBtn.classList.toggle('active', profilingEnabled.value)
    profilingBtn.textContent = profilingEnabled.value ? '📈 Profiling: ON' : '📈 Profiling: OFF'
    hotReloadBtn.classList.toggle('active', hotReload.value.enabled)
    hotReloadBtn.textContent = hotReload.value.text
  })
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
      profileText.value = `cycle #${event.cycle}: ${eventOrder} | total observado=${total.toFixed(2)}ms`
      for (const [cycle] of cycleEvents) {
        if (cycle < event.cycle - 4) cycleEvents.delete(cycle)
      }
    } else {
      profileText.value = `cycle #${event.cycle}: ${eventOrder}`
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
      devHookText.value = 'window.__AXIOM__ no disponible (modo no-dev o app no montada).'
      return
    }

    const beforeVersion = hook.version
    let immutable = false
    try {
      ;(hook as { version: string }).version = 'mutated'
      immutable = hook.version === beforeVersion
    } catch {
      immutable = true
    }

    devHookText.value = JSON.stringify(
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
      errorText.value = 'No se capturó contexto de error.'
      return
    }

    errorText.value = JSON.stringify(captured, null, 2)
  }

  profilingBtn.addEventListener('click', () => {
    profilingEnabled.value = !profilingEnabled.value

    if (profilingEnabled.value) {
      attachProfiling()
    } else {
      detachProfiling()
      profileText.value = 'Profiling detenido.'
    }

    refreshDevHookSnapshot()
  })

  hotReloadBtn.addEventListener('click', () => {
    const enabled = !hotReload.value.enabled
    hotReload.value = {
      enabled,
      text: enabled ? '♻️ Hot Reload Recovery: ON' : '♻️ Hot Reload Recovery: OFF',
    }

    if (enabled) {
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
  return () => { stop(); detachProfiling() }
}
