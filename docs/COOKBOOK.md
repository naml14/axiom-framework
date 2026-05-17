# Axiom Framework — Cookbook

Recetas prácticas organizadas por nivel de complejidad. Cada receta incluye el problema que resuelve, el código completo y una explicación de los conceptos clave.

---

## Tabla de Contenidos

1. [Hello World con Signals](#1-hello-world-con-signals)
2. [Dashboard con Layout](#2-dashboard-con-layout)
3. [Formularios con Validación](#3-formularios-con-validación)
4. [SSR Básico](#4-ssr-básico)
5. [Lista Dinámica con For/Show](#5-lista-dinámica-con-forshow)
6. [Responsive Container Query con `at`](#6-responsive-container-query-con-at)

---

## 1. Hello World con Signals

**Problema**: Quieres mostrar un contador reactivo donde la UI se actualiza automáticamente cuando cambia el estado, sin manipular el DOM manualmente.

```typescript
import { signal, computed, effect, defineComponent, createApp, stack, h } from 'axiom-framework'

// ============================================================
// Estado reactivo
// ============================================================

const count  = signal(0)
const doubled = computed(() => count.value * 2)
const label   = computed(() => count.value === 0 ? 'Empieza a contar' : `Valor: ${count.value}`)

// effect() corre inmediatamente y cada vez que cambia una dependencia
effect(() => {
  console.log('count cambió a:', count.value)
})

// ============================================================
// Componente
// ============================================================

const Counter = defineComponent(() =>
  stack({ gap: 12, padding: 24 },
    h('h1', null, 'Contador Reactivo'),
    h('p', null, label.value),
    h('p', null, `Doble: ${doubled.value}`),
    h('button', { onClick: () => { count.value++ } }, '+1'),
    h('button', { onClick: () => { count.value-- } }, '-1'),
    h('button', { onClick: () => { count.value = 0 } }, 'Reset'),
  )
)

createApp(Counter, document.getElementById('app')!).mount()
```

**Conceptos clave**:

- `signal(value)` — crea un valor reactivo. Lee con `.value`, escribe asignando a `.value`.
- `computed(() => expr)` — derivado de uno o más signals. Se recalcula automáticamente.
- `effect(() => ...)` — efecto secundario que se ejecuta cuando cambian sus dependencias. Retorna un `cleanup`.
- `defineComponent(fn)` — encapsula un árbol de nodos. La función se re-ejecuta en cada render reactivo.

---

## 2. Dashboard con Layout

**Problema**: Necesitas un layout complejo con columnas, filas anidadas y adaptación responsiva a distintos anchos de pantalla.

```typescript
import {
  signal, defineComponent, createApp,
  stack, row, grid, h,
  resolveResponsiveLayout,
} from 'axiom-framework'

// ============================================================
// Estado
// ============================================================

const sales   = signal(12_400)
const users   = signal(340)
const revenue = signal(98_200)

// ============================================================
// Componentes de tarjeta
// ============================================================

function StatCard(label: string, value: number, color: string) {
  return h('div', { style: { background: color, padding: '16px', borderRadius: '8px' } },
    h('p', { style: { margin: 0, fontSize: '12px', opacity: '0.7' } }, label),
    h('p', { style: { margin: 0, fontSize: '24px', fontWeight: 'bold' } }, String(value)),
  )
}

// ============================================================
// Dashboard principal
// ============================================================

const Dashboard = defineComponent(() =>
  stack({ gap: 24, padding: 32 },
    h('h1', null, 'Dashboard'),

    // Fila de métricas — 3 columnas
    grid({ columns: 3, gap: 16 },
      StatCard('Ventas', sales.value, '#e8f5e9'),
      StatCard('Usuarios', users.value, '#e3f2fd'),
      StatCard('Revenue', revenue.value, '#fff3e0'),
    ),

    // Sección inferior — 2 columnas con proporción 2:1
    row({ gap: 16 },
      h('section', { style: { flex: 2, background: '#f5f5f5', padding: '16px', borderRadius: '8px' } },
        h('h2', null, 'Actividad reciente'),
        h('p', null, 'Últimas 24 horas sin incidentes.'),
      ),
      h('aside', { style: { flex: 1, background: '#f5f5f5', padding: '16px', borderRadius: '8px' } },
        h('h2', null, 'Alertas'),
        h('p', null, 'Todo en orden.'),
      ),
    ),
  )
)

createApp(Dashboard, document.getElementById('app')!).mount()
```

**Conceptos clave**:

- `stack(props, ...children)` — apila elementos en columna (flex-direction: column).
- `row(props, ...children)` — alinea elementos en fila (flex-direction: row).
- `grid(props, ...children)` — grid de columnas fijas. La prop `columns` acepta número o mapa responsivo.
- Las props de layout (`gap`, `padding`, `columns`) trabajan en la unidad lógica del motor de layout; el DOM lo recibe como `style`.

---

## 3. Formularios con Validación

**Problema**: Necesitas un formulario con campos controlados y validación reactiva que muestre errores en tiempo real.

```typescript
import {
  signal, defineComponent, createApp,
  stack, h,
  bind, validate, required, minLength, pattern,
} from 'axiom-framework'

// ============================================================
// Estado del formulario
// ============================================================

const email    = signal('')
const password = signal('')
const submitted = signal(false)

// ============================================================
// Reglas de validación
// ============================================================

const emailRules    = [required(), pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido')]
const passwordRules = [required(), minLength(8, 'Mínimo 8 caracteres')]

// ============================================================
// Componente de formulario
// ============================================================

const LoginForm = defineComponent(() => {
  const emailResult    = validate(email.value, emailRules)
  const passwordResult = validate(password.value, passwordRules)
  const isValid        = emailResult.valid && passwordResult.valid

  function handleSubmit(e: Event): void {
    e.preventDefault()
    submitted.value = true
    if (!isValid) return
    console.log('Enviando:', { email: email.value, password: password.value })
  }

  function FieldError(result: ReturnType<typeof validate>): ReturnType<typeof h> | null {
    if (!submitted.value || result.valid) return null
    return h('p', { style: { color: 'red', margin: '4px 0 0', fontSize: '12px' } },
      result.errors[0] ?? 'Campo inválido',
    )
  }

  return stack({ gap: 16, padding: 32 },
    h('h1', null, 'Iniciar Sesión'),
    h('form', { onSubmit: handleSubmit },
      stack({ gap: 12 },
        stack({ gap: 4 },
          h('label', null, 'Email'),
          h('input', {
            type: 'email',
            value: email.value,
            onInput: (e: Event) => { email.value = (e.target as HTMLInputElement).value },
          }),
          FieldError(emailResult),
        ),
        stack({ gap: 4 },
          h('label', null, 'Contraseña'),
          h('input', {
            type: 'password',
            value: password.value,
            onInput: (e: Event) => { password.value = (e.target as HTMLInputElement).value },
          }),
          FieldError(passwordResult),
        ),
        h('button', { type: 'submit', disabled: !isValid && submitted.value }, 'Entrar'),
      ),
    ),
  )
})

createApp(LoginForm, document.getElementById('app')!).mount()
```

**Conceptos clave**:

- `bind(signal, element)` — vincula un signal a un elemento de formulario. Retorna cleanup.
- `validate(value, rules)` — retorna `{ valid, errors, pending }`. Es síncrono si todas las reglas son síncronas.
- `required()`, `minLength(n, msg)`, `maxLength(n, msg)`, `pattern(regex, msg)` — reglas predefinidas.
- Las reglas son funciones `(value) => string | null` — puedes crear las tuyas propias.

---

## 4. SSR Básico

**Problema**: Necesitas renderizar una página en el servidor (Node.js / Bun) y enviarla como HTML para luego hidratarla en el cliente.

```typescript
// ============================================================
// server.ts — renderizado en servidor
// ============================================================

import { renderToString, defineComponent, h, stack } from 'axiom-framework'

const HomePage = defineComponent(() =>
  stack({ gap: 16, padding: 32 },
    h('h1', null, 'Axiom SSR'),
    h('p', null, 'Esta página fue renderizada en el servidor.'),
    h('button', { id: 'hydrate-btn' }, 'Clic para interacción'),
  )
)

// renderToString devuelve el HTML completo; los metadatos se pasan en options.metadata
const metadata = {
  title: 'Axiom SSR Demo',
  description: 'Server-side rendering con Axiom',
}

const html = renderToString(HomePage, {
  metadata,
})

// Enviar al cliente
// html ya contiene <!DOCTYPE html>, <head> y <body>
console.log(html)

// ============================================================
// client.ts — hidratación en el navegador
// ============================================================

// import { createApp, defineComponent, h, stack } from 'axiom-framework'
//
// // El mismo componente que usó el servidor
// const HomePage = defineComponent(() =>
//   stack({ gap: 16, padding: 32 },
//     h('h1', null, 'Axiom SSR'),
//     h('p', null, 'Esta página fue renderizada en el servidor.'),
//     h('button', {
//       id: 'hydrate-btn',
//       onClick: () => alert('Componente hidratado!'),
//     }, 'Clic para interacción'),
//   )
// )
//
// // hydrate: reutiliza el HTML existente en el DOM, no re-renderiza
// createApp(HomePage, document.getElementById('app')!, { hydrate: true }).mount()
```

**Conceptos clave**:

- `renderToString(Component, options)` — renderiza un componente a HTML string sin DOM real.
- Retorna un `string` HTML completo; la metadata se envía vía `options.metadata`.
- `createApp(Component, root, { hydrate: true })` — en el cliente, hidrata el HTML existente en vez de borrarlo y recrearlo.
- El componente debe ser IDÉNTICO en servidor y cliente para que la hidratación sea correcta.

---

## 5. Lista Dinámica con For/Show

**Problema**: Necesitas renderizar una lista de elementos dinámicos con filtrado condicional y actualización eficiente cuando cambian los datos.

```typescript
import {
  signal, computed, defineComponent, createApp,
  stack, row, h,
  For, Show,
} from 'axiom-framework'

// ============================================================
// Tipos y estado
// ============================================================

interface Task {
  id: number
  title: string
  done: boolean
}

const tasks  = signal<Task[]>([
  { id: 1, title: 'Aprender Axiom', done: true },
  { id: 2, title: 'Construir algo', done: false },
  { id: 3, title: 'Publicar en npm', done: false },
])

const showDone   = signal(true)
const newTitle   = signal('')

const filtered   = computed(() =>
  showDone.value
    ? tasks.value
    : tasks.value.filter(t => !t.done)
)

const pending    = computed(() => tasks.value.filter(t => !t.done).length)

// ============================================================
// Acciones
// ============================================================

function addTask(): void {
  const title = newTitle.value.trim()
  if (!title) return
  tasks.value = [
    ...tasks.value,
    { id: Date.now(), title, done: false },
  ]
  newTitle.value = ''
}

function toggleTask(id: number): void {
  tasks.value = tasks.value.map(t =>
    t.id === id ? { ...t, done: !t.done } : t
  )
}

// ============================================================
// Componente
// ============================================================

const TodoApp = defineComponent(() =>
  stack({ gap: 16, padding: 32 },
    h('h1', null, 'Lista de Tareas'),

    // Contador — solo visible cuando hay tareas pendientes
    Show(pending.value > 0,
      h('p', null, `Pendientes: ${pending.value}`),
    ),

    // Formulario para agregar
    row({ gap: 8 },
      h('input', {
        value: newTitle.value,
        placeholder: 'Nueva tarea...',
        onInput: (e: Event) => { newTitle.value = (e.target as HTMLInputElement).value },
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') addTask() },
      }),
      h('button', { onClick: addTask }, 'Agregar'),
    ),

    // Filtro
    row({ gap: 8 },
      h('label', null,
        h('input', {
          type: 'checkbox',
          checked: showDone.value,
          onChange: (e: Event) => { showDone.value = (e.target as HTMLInputElement).checked },
        }),
        ' Mostrar completadas',
      ),
    ),

    // Lista — For itera con key para reconciliación eficiente
    For(filtered.value, t => t.id,
      (task) => row({ gap: 8 },
        h('input', {
          type: 'checkbox',
          checked: task.done,
          onChange: () => toggleTask(task.id),
        }),
        h('span', {
          style: { textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? '0.5' : '1' },
        }, task.title),
      )
    ),

    // Estado vacío
    Show(filtered.value.length === 0,
      h('p', { style: { opacity: '0.5' } }, 'No hay tareas que mostrar.'),
    ),
  )
)

createApp(TodoApp, document.getElementById('app')!).mount()
```

**Conceptos clave**:

- `For(items, keyFn, renderFn)` — itera sobre un array. `keyFn` provee una clave estable para reconciliación eficiente (como `key` en React). Sin key correcta, el DOM se destruye y recrea en cada cambio.
- `Show(condition, node)` — renderiza `node` solo si `condition` es verdadero. Alternativa declarativa a `condition ? node : null`.
- El patrón recomendado para listas mutables es reemplazar el array completo (`tasks.value = [...tasks.value, newItem]`) — los signals comparan por referencia.
- `computed()` para derivar la lista filtrada garantiza que el filtrado solo corre cuando cambian sus dependencias, no en cada render.

---

## 6. Theming y Estilos Seguros

**Problema**: Necesitas aplicar estilos dinámicos respetando un sistema de diseño (tokens) sin romper el determinismo de la fase de render.

```typescript
import {
  defineComponent, createApp, h, stack,
  createTheme, resolveStyleTokens
} from 'axiom-framework'

// 1. Definir tokens
const theme = createTheme({
  color: {
    primary: '#3b82f6',
    surface: '#f3f4f6',
    text: '#1f2937'
  },
  spacing: {
    sm: '8px',
    md: '16px',
    lg: '24px'
  },
  radius: { default: '8px' },
  typography: { size: { base: '16px' }, weight: { bold: '700' } }
})

// 2. Componente que usa tokens
const Card = defineComponent(() => {
  const cardStyle = resolveStyleTokens({
    backgroundColor: '$color.surface',
    padding: '$spacing.lg',
    borderRadius: '$radius.default',
    color: '$color.text'
  }, theme)

  const titleStyle = resolveStyleTokens({
    color: '$color.primary'
  }, theme)

  return stack({ gap: 16 },
    h('div', {
      style: cardStyle
    },
      h('h2', { style: titleStyle }, 'Theme Card'),
      h('p', null, 'This card is styled using the theme tokens.')
    )
  )
})

createApp(Card, document.getElementById('app')!).mount()
```

**Conceptos clave**:

- `createTheme(tokens)` define tu sistema de diseño.
- Usa `resolveStyleTokens(style, theme)` para convertir referencias `$...` a valores CSS antes de pasar `style` al nodo.
- No se permiten keys de layout directas como `position` o `display` en los estilos; usa los primitivos `stack`, `row`, `grid` en su lugar.

---

## 6. Responsive Container Query con `at`

**Problema**: Necesitas que un componente cambie su layout (por ejemplo, de columna a fila) en función del ancho del *contenedor padre*, no del viewport del dispositivo.

> **Importante**: `at` implementa un modelo de **container query**, no de media query de viewport. Los breakpoints se evalúan contra el `maxWidth` del contenedor tal como lo reporta el motor de reflow — no contra `window.innerWidth`. Esto hace el layout determinista en SSR y tests.

```typescript
import { defineComponent, createApp, stack, h } from 'axiom-framework'

// ============================================================
// Tarjeta que adapta su layout al ancho del contenedor
// ============================================================

const AdaptiveCard = defineComponent(() =>
  h('div', {
    // Sin `at`: layout de columna por defecto (mobile-first)
    flex: 'column',
    gap: 12,
    padding: 16,

    // `at` aplica overrides cuando el contenedor satisface el breakpoint.
    // Los breakpoints se evalúan en orden ascendente; el más grande que
    // coincida gana en propiedades conflictivas (cascada aditiva).
    at: {
      // sm: 480 px — el contenedor tiene al menos 480 px de ancho
      sm: { padding: 20 },

      // md: 768 px — cambia a fila y agranda el gap
      md: { flex: 'row', gap: 24, padding: 24 },

      // lg: 1024 px — más espacio interno; `flex: 'row'` heredado de md
      lg: { gap: 32, padding: 32 },
    },
  },
    h('img', { src: '/avatar.png', width: 64, height: 64 }),
    stack({ gap: 8 },
      h('h2', null, 'Nombre del usuario'),
      h('p', null, 'Descripción breve del perfil.'),
    ),
  )
)

createApp(AdaptiveCard, document.getElementById('app')!).mount()
```

**Cómo funciona la cascada aditiva**:

Dado un contenedor de 1200 px de ancho, los breakpoints `sm`, `md`, y `lg` coinciden todos. El motor aplica sus overrides en orden ascendente:

| Breakpoint | Coincide | Propiedad        | Valor aplicado |
|------------|----------|------------------|----------------|
| `sm` (480) | ✅       | `padding`        | `20`           |
| `md` (768) | ✅       | `flex`, `gap`, `padding` | `'row'`, `24`, `24` (sobreescribe sm) |
| `lg` (1024)| ✅       | `gap`, `padding` | `32`, `32` (sobreescribe md) |

Resultado final: `{ flex: 'row', gap: 32, padding: 32 }`.

**`vw`/`vh` dentro de `at`**:

```typescript
h('div', {
  at: {
    md: { width: '80vw' },  // si viewportWidth no está disponible,
                             // se resuelve contra maxWidth del contenedor
  }
})
```

Cuando `viewportWidth` no se pasa al renderer (caso SSR o test), `vw` cae back al `maxWidth` del contenedor. Este comportamiento es por diseño — ver `openspec/specs/responsive-breakpoints.md §Requirement 2`.

**Conceptos clave**:

- `at` es un modelo de **container query**: los breakpoints se evalúan contra el `maxWidth` del *contenedor*, no del viewport.
- Las claves nombradas (`sm`, `md`, `lg`, `xl`) mapean a px fijos; las numéricas también son válidas: `at: { 600: { gap: 8 } }`.
- La cascada es **aditiva**: todas las propiedades de breakpoints coincidentes se fusionan. En conflictos, el breakpoint mayor gana.
- `vw`/`vh` sin `viewportWidth`/`viewportHeight` explícito caen back al tamaño del contenedor — seguro para SSR y tests.
- No se requieren media queries CSS; toda la lógica vive en el motor de layout de Axiom.
