// ============================================================
// demo/context-demo.ts — Context API + Stores Demo
//
// Demuestra:
//  - createContext<T>() — define un contexto tipado
//  - withContext(ctx, value, children) — provider (push to stack)
//  - useContext(ctx) — lee del stack top
//  - createStore(initial) — store con setState(value | updater)
//  - provideStore(store, children) + injectStore(store)
//
// Patrón: árbol de componentes Axiom que pasan contexto implícitamente
// por el call stack del Provider.
// ============================================================

import {
  signal,
  defineComponent,
  createApp,
  createContext,
  withContext,
  useContext,
  createStore,
  provideStore,
  injectStore,
  h,
  stack,
  row,
} from '../src/index.ts'
import type { Context, StoreInstance, ComponentNode } from '../src/index.ts'

// ============================================================
// Theme context — light/dark signal
// ============================================================

type Theme = 'light' | 'dark'

const ThemeContext: Context<Theme> = createContext<Theme>('light')

// ============================================================
// Counter store — shared mutable state
// ============================================================

interface CounterState {
  count: number
  lastUpdated: number
}

const counterStore: StoreInstance<CounterState> = createStore<CounterState>({
  count: 0,
  lastUpdated: Date.now(),
})

// ============================================================
// Provider component — wraps the tree
// ============================================================

const themeSignal = signal<Theme>('light')

const Provider = defineComponent((props: { children: () => unknown }) => {
  return withContext(ThemeContext, themeSignal, () => {
    // provideStore retorna void y empuja el frame del store solo DENTRO de su
    // callback. Capturamos el nodo ahí para que los consumers se rendericen
    // dentro del frame y `injectStore` resuelva desde el provider real
    // (si se llamara después de `children()`, el subtree ya estaría
    // evaluado fuera del frame y caería al fallback por defecto).
    let node!: ComponentNode
    provideStore(counterStore, () => {
      node = props.children() as ComponentNode
    })
    return node
  })
})

// ============================================================
// Consumer A — displays current theme + toggle button
// ============================================================

const ThemeConsumer = defineComponent(() => {
  const theme = useContext(ThemeContext)

  // Render a button that toggles theme. This is an Axiom-owned element,
  // so we use `on: { click: fn }` declaratively inside the tree.
  // Card con `stack({ gap, padding })` — el inset lo declara el motor; sin
  // `attrs.style` (borraría la geometría del commit) y sin `<br>` (rompe la
  // aritmética de líneas).
  return stack({ gap: 6, padding: 10, class: ['demo-card'] },
    h('div', { class: ['hero-badge'], height: 20 }, '🎨 Theme consumer'),
    h('p', { class: ['hero-body'], height: 20 }, `Current theme: ${theme.value}`),
    h('button', {
      class: ['btn-toggle'],
      height: 30,
      onClick: () => {
        theme.value = theme.value === 'light' ? 'dark' : 'light'
      },
    }, `Toggle theme → ${theme.value === 'light' ? 'dark' : 'light'}`),
  )
})

// ============================================================
// Consumer B — displays counter from injected store
// ============================================================

const CounterConsumer = defineComponent((props: { label: string }) => {
  const store = injectStore(counterStore)

  // Fila de 3 botones: 70 + 6 + 70 + 6 + 85 = 237 ≤ 245 (ancho contenido card).
  // Declaramos `width` en cada hijo porque en `row` el motor asigna el ancho
  // completo disponible a los hijos sin `width`.
  return stack({ gap: 6, padding: 10, class: ['demo-card'] },
    h('div', { class: ['hero-badge'], height: 20 }, `🔢 Counter (${props.label})`),
    h('p', { class: ['hero-body'], height: 20 }, `count = ${store.state.value.count}`),
    row({ gap: 6, padding: 0 },
      h('button', {
        class: ['btn-toggle'],
        height: 30,
        width: 70,
        onClick: () => {
          store.setState((prev) => ({
            count: prev.count + 1,
            lastUpdated: Date.now(),
          }))
        },
      }, '+ 1'),
      h('button', {
        class: ['btn-toggle'],
        height: 30,
        width: 70,
        onClick: () => {
          store.setState((prev) => ({
            count: Math.max(0, prev.count - 1),
            lastUpdated: Date.now(),
          }))
        },
      }, '− 1'),
      h('button', {
        class: ['btn-toggle'],
        height: 30,
        width: 85,
        onClick: () => {
          store.setState({ count: 0, lastUpdated: Date.now() })
        },
      }, 'reset'),
    ),
    h('p', { class: ['hero-body'], height: 20 },
      `updated ${new Date(store.state.value.lastUpdated).toLocaleTimeString()}`,
    ),
  )
})

// ============================================================
// Root component
// ============================================================

const ContextDemoRoot = defineComponent(() => {
  const codeCard = stack({ gap: 4, padding: 10, class: ['demo-card'] },
    h('div', { class: ['hero-badge'], height: 20 }, '📎 Snippet'),
    h('code', { class: ['demo-code'], height: 20 }, 'withContext(ctx, value, fn)'),
    h('code', { class: ['demo-code'], height: 20 }, 'provideStore(store, fn)'),
  )
  const children = (): unknown => stack({ gap: 8, padding: 12 },
    ThemeConsumer(),
    // Two counter consumers — they share the SAME store, so changes propagate
    CounterConsumer({ label: 'A' }),
    CounterConsumer({ label: 'B' }),
    codeCard,
  )
  return Provider({ children })
})

// ============================================================
// Entry point
// ============================================================

export function initContextDemo(): void {
  const container = document.getElementById('context-demo-root')
  if (container === null) {
    console.warn('[ContextDemo] container #context-demo-root not found in DOM')
    return
  }
  const app = createApp(ContextDemoRoot, container)
  app.mount()
}
