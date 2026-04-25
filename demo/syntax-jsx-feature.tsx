// ============================================================
// demo/syntax-jsx-feature.tsx — Feature 6: JSX Syntax
// Axiom Framework — Syntax v2 Showcase
//
// Demuestra JSX como azúcar sintáctico sobre h() + t().
// El árbol producido es IDÉNTICO al de h() — JSX solo cambia
// cómo se ESCRIBE, no qué se genera.
// ============================================================

/// <reference types="../src/jsx.d.ts" />

import {
  signal,
  defineComponent,
  createApp,
  For,
  Show,
} from '../src/index.ts'

// ============================================================
// Subcomponentes JSX — demuestran componentes como funciones
// ============================================================

interface BadgeProps {
  label: string
  active?: boolean
}

function Badge({ label, active }: BadgeProps) {
  return (
    <div
      class={active ? 'syntax-demo-item syntax-demo-item--switch' : 'syntax-demo-item'}
      flex="row"
      gap={4}
      padding={8}
    >
      {label}
    </div>
  )
}

interface ItemListProps {
  items: string[]
  visible: boolean
}

function ItemList({ items, visible }: ItemListProps) {
  return (
    <div flex="column" gap={4} padding={0}>
      <Show
        when={visible}
        fallback={<div class="syntax-demo-item" padding={6}>🙈 Lista oculta</div>}
      >
        <For
          each={items}
          keyBy={(item) => item}
          children={(item) => (
            <div class="syntax-demo-item" padding={6}>• {item}</div>
          )}
        />
      </Show>
    </div>
  )
}

// ============================================================
// Main export
// ============================================================

export function initJsxFeature(): void {
  const container = document.getElementById('syntax-jsx-root')
  const outputEl  = document.getElementById('syntax-jsx-output')
  const toggleBtn = document.getElementById('syntax-jsx-toggle-btn')
  const addBtn    = document.getElementById('syntax-jsx-add-btn')
  if (!container || !outputEl || !toggleBtn || !addBtn) return

  const outputNode = outputEl

  const visible = signal(true)
  const items   = signal(['Alpha', 'Beta', 'Gamma'])
  const active  = signal(0)

  const BADGES = ['UI', 'SSR', 'JSX', 'DX']

  const JsxDemo = defineComponent(() => (
    <div flex="column" gap={10} padding={15}>

      {/* Badges — demuestran componentes JSX con props */}
      <div class="syntax-flow-label">Componentes JSX con props</div>
      <div flex="row" wrap="wrap" gap={6} padding={0}>
        {BADGES.map((label, i) => (
          <Badge key={label} label={label} active={active.value === i} />
        ))}
      </div>

      {/* Show + For — demuestran control de flujo en JSX */}
      <div class="syntax-flow-label">Show + For en JSX</div>
      <ItemList items={items.value} visible={visible.value} />

    </div>
  ))

  const app = createApp(JsxDemo, container)
  app.mount()

  function syncOutput() {
    outputNode.textContent =
      `visible=${visible.value}  items=${items.value.length}  active=${BADGES[active.value]}`
  }

  toggleBtn.addEventListener('click', () => {
    visible.value = !visible.value
    toggleBtn.textContent = `Show: ${visible.value ? 'visible' : 'oculto'}`
    if (visible.value) toggleBtn.classList.add('active')
    else toggleBtn.classList.remove('active')
    syncOutput()
  })

  addBtn.addEventListener('click', () => {
    items.value = [...items.value, `Item ${items.value.length + 1}`]
    syncOutput()
  })

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const idx = BADGES.findIndex((b) => target.textContent?.trim() === b)
    if (idx !== -1) {
      active.value = idx
      syncOutput()
    }
  })

  syncOutput()
}
