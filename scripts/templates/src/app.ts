import {
  signal,
  computed,
  defineComponent,
  createApp,
  stack,
  row,
  h,
  t,
  For,
} from 'axiom-framework'

// ─── State ───────────────────────────────────────────────────────────────────

const count = signal(0)
const doubled = computed(() => count.value * 2)

const items = signal<string[]>(['First item', 'Second item'])
const newItem = signal('')

// ─── App ─────────────────────────────────────────────────────────────────────

const App = defineComponent(() =>
  stack({ class: 'app' },

    // ── Header ───────────────────────────────────────────────────────────────
    h('header', { class: 'header' },
      h('h1', null, '{{PROJECT_NAME}}'),
      h('p', { class: 'hint' }, 'Edit `src/app.ts` to start building'),
    ),

    // ── Counter ───────────────────────────────────────────────────────────────
    h('section', { class: 'section' },
      h('h2', null, 'Counter'),
      h('p', { class: 'count-value' }, String(count.value)),
      h('p', { class: 'count-derived' },
        t('doubled: '),
        h('strong', null, String(doubled.value)),
      ),
      row({ gap: 8, class: 'controls' },
        h('button', { onClick: () => { count.value-- } }, '−'),
        h('button', { class: 'btn-reset', onClick: () => { count.value = 0 } }, 'Reset'),
        h('button', { onClick: () => { count.value++ } }, '+'),
      ),
    ),

    // ── List ─────────────────────────────────────────────────────────────────
    h('section', { class: 'section' },
      h('h2', null, 'Items'),
      h('ul', { class: 'list' },
        For({
          each: items.value,
          keyBy: (_item, i) => String(i),
          children: (item) => h('li', { class: 'list-item' }, item),
        }),
      ),
      row({ gap: 8, class: 'add-row' },
        h('input', {
          type: 'text',
          class: 'add-input',
          placeholder: 'New item…',
          value: newItem.value,
          onInput: (e: Event) => {
            newItem.value = (e.target as HTMLInputElement).value
          },
        }),
        h('button', {
          onClick: () => {
            const val = newItem.value.trim()
            if (val) {
              items.value = [...items.value, val]
              newItem.value = ''
            }
          },
        }, 'Add'),
      ),
    ),

    // ── Next steps ────────────────────────────────────────────────────────────
    h('section', { class: 'section next-steps' },
      h('h2', null, 'Next steps'),
      h('ul', null,
        h('li', null, 'Edit components in ', h('code', null, 'src/app.ts')),
        h('li', null, 'Try ', h('code', null, 'signal()'), ' and ', h('code', null, 'computed()')),
        h('li', null, 'Compose with ', h('code', null, 'defineComponent()')),
        h('li', null,
          h('a', { href: 'https://github.com/naml14/axiom-framework' }, 'Read the docs ↗'),
        ),
      ),
    ),
  )
)

createApp(App, document.getElementById('app')!).mount()
