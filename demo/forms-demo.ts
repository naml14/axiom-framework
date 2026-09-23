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

// Renderiza solo el primer error en la línea visible (no se expone el mensaje
// completo: `src/render/diff.ts` no difiere `attrs`, así que un `title`
// reactivo quedaría congelado en el primer render).
function statusLabel(result: Signal<ValidationResult>): {
  text: string
  mod: string
} {
  const r = result.value
  if (r.pending) {
    return { text: 'checking…', mod: 'form-status--pending' }
  }
  if (r.valid) {
    return { text: '✓ valid', mod: 'form-status--valid' }
  }
  const firstError = r.errors[0] ?? 'invalid value'
  return {
    text: `✗ ${firstError}`,
    mod: 'form-status--invalid',
  }
}

// Card de campo: micro-label, input (nodo del motor — sin `attrs.style`, el
// motor le da el ancho del contenido de la card) y status de una sola línea.
// Hoist a module scope para no re-crear la función en cada render.
interface FieldCardSpec {
  label: string
  type: 'text' | 'email'
  inputId: string
  placeholder: string
  testid: string
  status: { text: string; mod: string }
}

function FieldCard(spec: FieldCardSpec) {
  // `<label htmlFor>` restaura el foco al click y el nombre accesible del
  // input. `htmlFor` es prop de primer nivel → atributo `for`, y es seguro
  // aunque `src/render/diff.ts` no difee `attrs`: la asociación label→input es
  // estática, y solo los atributos que cambian en runtime son un problema.
  const labelRow = h('label', { class: ['hero-badge'], htmlFor: spec.inputId, height: 20 }, spec.label)
  const inputRow = h('input', {
    type: spec.type,
    id: spec.inputId,
    class: ['demo-input'],
    height: 30,
    placeholder: spec.placeholder,
    data: { testid: spec.testid },
  })
  const statusRow = h(
    'div',
    {
      class: ['form-status', spec.status.mod],
      height: 20,
    },
    spec.status.text,
  )
  return stack({ gap: 6, padding: 10, class: ['demo-card'] },
    labelRow, inputRow, statusRow,
  )
}

// ============================================================
// Root component — renders the form
// ============================================================

const FormsDemoRoot = defineComponent(() => {
  const u = statusLabel(usernameResult)
  const e = statusLabel(emailResult)

  const liveStateCard = stack({ gap: 4, padding: 10, class: ['demo-card'] },
    h('div', { class: ['hero-badge'], height: 20 }, '🧪 Live state'),
    h('code', { class: ['demo-code'], height: 20 }, `username = "${username.value}"`),
    h('code', { class: ['demo-code'], height: 20 }, `email = "${email.value}"`),
  )

  return stack({ gap: 8, padding: 12 },
    FieldCard({
      label: '👤 Username',
      type: 'text',
      inputId: 'forms-username-input',
      placeholder: 'user_name',
      testid: 'username-input',
      status: u,
    }),
    FieldCard({
      label: '📧 Email',
      type: 'email',
      inputId: 'forms-email-input',
      placeholder: 'name@domain.com',
      testid: 'email-input',
      status: e,
    }),
    liveStateCard,
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
