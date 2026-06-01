import {
  signal,
  computed,
  defineComponent,
  createApp,
  stack,
  row,
  h,
  For,
} from 'axiom-framework'

// ─── State ───────────────────────────────────────────────────────────────────

const count = signal(0)
const doubled = computed(() => count.value * 2)

const items = signal<string[]>(['First item', 'Second item'])
const newItem = signal('')

// ─── App ─────────────────────────────────────────────────────────────────────
//
// Axiom computes layout in JS (positions + sizes), so spacing and sizing live
// in `layout` props (gap, padding, width, height) — NOT in CSS. CSS is used
// only for visual styling (color, font, background, borders).

const App = defineComponent(() =>
  stack({ class: 'app', gap: 28, padding: 32 },

    // ── Header ───────────────────────────────────────────────────────────────
    stack({ class: 'header', gap: 6 },
      h('h1', { class: 'title', layout: { height: 38 } }, '{{PROJECT_NAME}}'),
      h('p', { class: 'hint', layout: { height: 22 } }, 'Edit src/app.ts to start building'),
    ),

    // ── Counter ───────────────────────────────────────────────────────────────
    stack({ class: 'section', gap: 12 },
      h('h2', { class: 'eyebrow', layout: { height: 16 } }, 'Counter'),
      h('p', { class: 'count-value', layout: { height: 70 } }, String(count.value)),
      h('p', { class: 'count-derived', layout: { height: 22 } }, `doubled: ${doubled.value}`),
      row({ class: 'controls', gap: 8, layout: { height: 40 } },
        h('button', { layout: { width: 48 }, onClick: () => { count.value-- } }, '−'),
        h('button', { class: 'btn-reset', layout: { width: 96 }, onClick: () => { count.value = 0 } }, 'Reset'),
        h('button', { layout: { width: 48 }, onClick: () => { count.value++ } }, '+'),
      ),
    ),

    // ── List ─────────────────────────────────────────────────────────────────
    stack({ class: 'section', gap: 12 },
      h('h2', { class: 'eyebrow', layout: { height: 16 } }, 'Items'),
      stack({ class: 'list', gap: 6 },
        For({
          each: items.value,
          keyBy: (_item, i) => String(i),
          children: (item) => h('div', { class: 'list-item', layout: { height: 40 } }, item),
        }),
      ),
      row({ class: 'add-row', gap: 8, layout: { height: 40 } },
        h('input', {
          type: 'text',
          class: 'add-input',
          layout: { width: 472, height: 40 },
          placeholder: 'New item…',
          value: newItem.value,
          onInput: (e: Event) => {
            newItem.value = (e.target as HTMLInputElement).value
          },
        }),
        h('button', {
          layout: { width: 96 },
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
    stack({ class: 'section', gap: 10 },
      h('h2', { class: 'eyebrow', layout: { height: 16 } }, 'Next steps'),
      stack({ class: 'next-steps', gap: 8 },
        h('div', { class: 'next-item', layout: { height: 22 } }, 'Edit components in src/app.ts'),
        h('div', { class: 'next-item', layout: { height: 22 } }, 'Try signal() and computed()'),
        h('div', { class: 'next-item', layout: { height: 22 } }, 'Compose with defineComponent()'),
        h('a', { class: 'next-item link', href: 'https://github.com/naml14/axiom-framework', layout: { height: 22 } }, 'Read the docs ↗'),
      ),
    ),
  )
)

createApp(App, document.getElementById('app')!, { lineHeight: 22 }).mount()
