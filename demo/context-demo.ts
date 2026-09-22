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
import type { Context, StoreInstance } from '../src/index.ts'

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
  // withContext returns whatever the inner function returns; provideStore returns void,
  // so we capture the inner component node via children() directly.
  return withContext(ThemeContext, themeSignal, () => {
    const node = props.children() as ReturnType<typeof ThemeConsumer>
    // Provide the counter store for this subtree (push/pop around the same children())
    provideStore(counterStore, () => undefined)
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
  return stack({ gap: 6, padding: 8 },
    h('div', { class: ['hero-badge'] }, '🎨 THEME CONSUMER'),
    h('p', { class: ['hero-body'] }, `Current theme: ${theme.value}`),
    h('button', {
      class: ['btn-toggle'],
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

  return stack({ gap: 6, padding: 8 },
    h('div', { class: ['hero-badge'] }, `🔢 COUNTER (${props.label})`),
    h('p', { class: ['hero-body'] }, `count = ${store.state.value.count}`),
    h('div', { flex: 'row', gap: 4, padding: 0 },
      h('button', {
        class: ['btn-toggle'],
        onClick: () => {
          store.setState((prev) => ({
            count: prev.count + 1,
            lastUpdated: Date.now(),
          }))
        },
      }, '+ 1'),
      h('button', {
        class: ['btn-toggle'],
        onClick: () => {
          store.setState((prev) => ({
            count: Math.max(0, prev.count - 1),
            lastUpdated: Date.now(),
          }))
        },
      }, '− 1'),
      h('button', {
        class: ['btn-toggle'],
        onClick: () => {
          store.setState({ count: 0, lastUpdated: Date.now() })
        },
      }, 'reset'),
    ),
    h('p', { class: ['hero-body'] }, `last updated: ${new Date(store.state.value.lastUpdated).toLocaleTimeString()}`),
  )
})

// ============================================================
// Root component
// ============================================================

const ContextDemoRoot = defineComponent(() => {
  const children = (): unknown => stack({ gap: 10, padding: 16 },
    h('h2', { class: ['hero-title'] }, 'Context API + Stores'),
    h('p', { class: ['hero-body'] },
      'ThemeContext fluye por call-stack del Provider. counterStore es accesible ' +
      'en cualquier hijo vía injectStore — ambos consumers ven el mismo state.',
    ),
    h('div', { flex: 'column', gap: 8, padding: 0 },
      ThemeConsumer(),
      // Two counter consumers — they share the SAME store, so changes propagate
      CounterConsumer({ label: 'A' }),
      CounterConsumer({ label: 'B' }),
    ),
    h('div', { class: ['syntax-demo-item'], padding: 8 },
      h('code', {}, 'withContext(ThemeContext, themeSignal, () => …)'),
      h('br'),
      h('code', {}, 'provideStore(counterStore, () => …)'),
    ),
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
