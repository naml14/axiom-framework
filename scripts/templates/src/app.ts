import { signal, computed, defineComponent, createApp, stack, h } from 'axiom-framework'

const count = signal(0)
const doubled = computed(() => count.value * 2)

const App = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('h1', null, 'Hello Axiom!'),
    h('p', null, `Count: ${count.value}`),
    h('p', null, `Doubled: ${doubled.value}`),
    h('button', { onClick: () => { count.value++ } }, 'Increment'),
  )
)

createApp(App, document.getElementById('app')!).mount()
