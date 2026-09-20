// ============================================================
// demo/forms-demo.ts — Forms: bind() + validate() Demo
//
// Demuestra:
//  - bind(signal, input) — two-way binding signal ↔ DOM
//  - validate(source, rules, options) — returns Signal<ValidationResult>
//  - Sync rules: required, minLength, maxLength, pattern
//  - Async rule con setTimeout simulado
//  - Disposal correcto vía .dispose()
//
// Patrón: inputs son elementos DOM-managed externamente (addEventListener de
// `bind()` los registra). Los botones usan addEventListener (escape hatch).
// ============================================================

import {
  signal,
  defineComponent,
  createApp,
  bind,
  validate,
  required,
  minLength,
  maxLength,
  pattern,
  h,
  stack,
  row,
} from '../src/index.ts'
import type { Signal, ValidationResult } from '../src/index.ts'

// ============================================================
// State — signal para el username + result signal para validation
// ============================================================

const username = signal<string>('')
const email = signal<string>('')

// Async rule — chequea formato email simple + simula latencia.
// IMPORTANTE: debe ser declarada con `async function` para que `isAsyncFunctionRule`
// la detecte como async. Una arrow function que retorna Promise NO se detecta.
async function asyncEmailFormat(value: string): Promise<string | null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      resolve(ok ? null : 'Invalid email format')
    }, 300)
  })
}

const usernameResult = validate(username, [
  required,
  minLength(3),
  maxLength(20),
  pattern(/^[a-zA-Z0-9_]+$/, 'Only letters, digits, underscores'),
])

const emailResult = validate(email, [required, asyncEmailFormat], {
  debounceMs: 200,
})

// ============================================================
// Helpers
// ============================================================

function statusLabel(result: Signal<ValidationResult>): { text: string; class: string } {
  const r = result.value
  if (r.pending) return { text: '⏳ checking…', class: 'form-status form-status--pending' }
  if (r.valid) return { text: '✓ valid', class: 'form-status form-status--valid' }
  return { text: `✗ ${r.errors.join('; ')}`, class: 'form-status form-status--invalid' }
}

// ============================================================
// Root component — renders the form
// ============================================================

const FormsDemoRoot = defineComponent(() => {
  const u = statusLabel(usernameResult)
  const e = statusLabel(emailResult)

  return stack({ gap: 12, padding: 16 },
    h('div', { class: ['hero-badge'] }, '📝 FORMS'),
    h('h2', { class: ['hero-title'] }, 'Two-way binding + validation'),
    h('p', { class: ['hero-body'] },
      'bind(input, signal) conecta un input a un signal — los cambios en el DOM ' +
      'se reflejan en el signal y viceversa. validate(source, rules, options) ' +
      'retorna un Signal<ValidationResult> reactivo.',
    ),

    // Username field
    h('div', { class: ['syntax-demo-item'], padding: 10 },
      h('label', { class: ['hero-body'] },
        h('strong', {}, 'Username: '),
        h('input', {
          type: 'text',
          id: 'forms-username-input',
          placeholder: '3-20 chars, alphanumeric + underscore',
          attrs: { 'data-testid': 'username-input', style: 'padding:6px 8px;margin-left:8px' },
        }),
      ),
      h('div', { class: [u.class], padding: 6 }, u.text),
    ),

    // Email field
    h('div', { class: ['syntax-demo-item'], padding: 10 },
      h('label', { class: ['hero-body'] },
        h('strong', {}, 'Email: '),
        h('input', {
          type: 'email',
          id: 'forms-email-input',
          placeholder: 'name@domain.com',
          attrs: { 'data-testid': 'email-input', style: 'padding:6px 8px;margin-left:8px' },
        }),
      ),
      h('div', { class: [e.class], padding: 6 }, e.text),
    ),

    // Inspector
    h('div', { class: ['syntax-demo-item'], padding: 8 },
      h('strong', {}, 'Live state: '),
      h('code', {}, `username="${username.value}"`),
      h('br'),
      h('code', {}, `email="${email.value}"`),
    ),
  )
})

// ============================================================
// Entry point — bind + mount
// ============================================================

export function initFormsDemo(): void {
  const container = document.getElementById('forms-demo-root')
  if (container === null) {
    console.warn('[FormsDemo] container #forms-demo-root not found in DOM')
    return
  }

  const app = createApp(FormsDemoRoot, container)
  app.mount()

  // Two-way bind AFTER mount so the input elements are in the DOM.
  // Note: bind() uses addEventListener internally. This is the documented
  // escape hatch for inputs that are bound to signals — the input elements
  // are owned by Axiom (via the component tree) but the binding is set up
  // post-mount to ensure the DOM nodes exist.
  const usernameInput = document.getElementById('forms-username-input') as HTMLInputElement | null
  const emailInput = document.getElementById('forms-email-input') as HTMLInputElement | null

  let disposeUsername: (() => void) | null = null
  let disposeEmail: (() => void) | null = null

  if (usernameInput !== null) {
    disposeUsername = bind(username, usernameInput)
  }
  if (emailInput !== null) {
    disposeEmail = bind(email, emailInput)
  }

  // Cleanup hook for hot-reload safety
  ;(window as { __FORMS_DEMO_CLEANUP__?: () => void }).__FORMS_DEMO_CLEANUP__ = () => {
    disposeUsername?.()
    disposeEmail?.()
    usernameResult.dispose()
    emailResult.dispose()
    app.unmount()
  }
}
