# Axiom — Framework Web con Renderizado en Dos Fases

> **Filosofía central:** Separar el trabajo costoso (que solo depende de los datos) del trabajo barato (que solo depende del layout actual).
>
> Inspirado en `@chenglou/pretext` — ver `SPEC-TEXT-LAYOUT-ENGINE.md` para el análisis técnico profundo.

---

## Visión

Construir un framework web donde el DOM es **solo la pantalla de salida**, nunca la fuente de verdad para cálculos de layout. El costo de actualizar la pantalla se reduce al mínimo físicamente posible porque:

1. **Todos los cálculos se hacen en memoria** — sin lecturas del DOM intercaladas con escrituras
2. **El trabajo costoso se hace UNA vez** — cuando cambian los datos, no cuando cambia el viewport
3. **El hot path es aritmética pura** — sin strings, sin canvas, sin DOM, sin allocations innecesarias

### Por qué "Axiom"

Un axioma es una verdad fundamental que no necesita demostración. La filosofía de este framework debería ser axiomática en el desarrollo web: **separar el trabajo costoso del barato es la base sobre la que se construye software eficiente**.

Viene de la mentalidad de sistemas embebidos donde cada byte y cada ciclo de CPU cuentan desde el diseño — no hay "después optimizamos". El principio es simple:

- **Todo puede fallar** — cada lectura del DOM es un punto de falla potencial (layout thrashing, reflows inesperados)
- **Optimizar desde el diseño** — no como parche posterior, sino como axioma arquitectónico

### Roadmap a largo plazo

| Fase                      | Qué                   | Por qué                                                                                                                                       |
|---------------------------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **Fase 1-3 (este plan)**  | Runtime puro          | Demostrar el principio, validar la arquitectura                                                                                               |
| **Fase 4+ (futuro)**      | Compilador + Runtime  | Transformar templates/JSX en código optimizado que separe prepare-time de layout-time automáticamente (como Svelte hace con reactividad)      |

---

## Arquitectura del Sistema

```Text
┌──────────────────────────────────────────────────────────────────┐
│                     PUBLIC API                                    │
│  defineComponent()  signal()  computed()  createApp()  mount()   │
└───────────────────────────┬──────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│   signals.ts     │ │ component.ts  │ │  renderer.ts     │
│ Signal primitives│ │ Component def │ │  Render loop     │
│ Dependency graph │ │ Prepare logic │ │  Scheduler       │
└────────┬─────────┘ └──────┬───────┘ └────────┬────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│   prepare.ts     │ │  reflow.ts    │ │   commit.ts      │
│ Análisis de comp │ │ Layout aritm. │ │  DOM batch write │
│ Cache de métricas│ │ Fast paths    │ │  No interleaving │
└─────────────────┘ └──────────────┘ └─────────────────┘
```

### El ciclo de actualización

```Text
Estado cambia (signal.set())
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ FASE 1: DIFF REACTIVO                                       │
│ • Signals notifican a los componentes suscritos             │
│ • Clasificar: ¿cambió "forma" (re-prepare) o "valor" (reflow)? │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ FASE 2: PREPARACIÓN (si es necesario)                       │
│ • Solo componentes con "shape changes"                      │
│ • Análisis de estructura, pre-cálculo de métricas           │
│ • SIN TOCAR EL DOM                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ FASE 3: REFLOW (hot path — SIEMPRE)                         │
│ • Aritmética pura sobre prepared handles + viewport actual  │
│ • Cero lecturas DOM                                         │
│ • Calcular posiciones, tamaños, qué nodos cambiar           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ FASE 4: COMMIT BATCHEADO                                    │
│ • Aplicar TODAS las escrituras DOM de una sola vez          │
│ • Orden: removes → updates → inserts                        │
│ • Sin lecturas intercaladas                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Conceptos Clave

### PreparedComponent (el "PreparedText" del framework)

Así como `PreparedText` contiene todo lo necesario para calcular layout de texto sin volver a analizar el string, `PreparedComponent` contiene todo lo necesario para calcular el layout de un componente sin volver a analizar sus props.

```typescript
interface PreparedComponent {
  // Estructura
  nodeType: 'element' | 'text' | 'fragment'
  tag?: string                    // 'div', 'span', etc.
  children: PreparedComponent[]   // Sub-árbol preparado

  // Métricas pre-calculadas (dependen SOLO de props, no de viewport)
  metrics: ComponentMetrics

  // Optimización
  simpleLayout: boolean           // ¿Puede usar fast path?
  needsMeasure: boolean           // ¿Necesita medición real o es trivial?
}

interface ComponentMetrics {
  // Facts que dependen solo de props, no de viewport
  minWidth: number                // Ancho mínimo intrínseco
  idealWidth: number              // Ancho preferido
  aspectRatio?: number            // Si aplica
  isInline: boolean               // ¿Comporta como inline?
  hasTextContent: boolean         // ¿Contiene texto que necesita medición?
}
```

### Signals con dos niveles de suscripción

```typescript
// Signal de "valor" — cambia el contenido pero no la estructura
// Solo trigger reflow (barato)
const count = signal(0)           // Signal<number>

// Signal de "forma" — cambia la estructura del componente
// Trigger re-prepare + reflow (costoso, pero solo una vez)
const items = signal<Item[]>([])  // Signal<Item[]> — si cambia length, re-prepare
```

El framework clasifica automáticamente:

- **Cambios de valor** → el DOM node existe, solo cambia texto/atributo → reflow
- **Cambios de forma** → agregan/remueven nodos → re-prepare + reflow

---

## Principio de Naming Consistente

Todos los nombres de la API siguen una convención intuitiva que se mantiene a lo largo de todo el desarrollo:

| Patrón | Ejemplos | Por qué |
| -------- | ---------- | --------- |
| **`signal`** | `signal()`, `computed()`, `effect()` | Término universal de reactividad — cualquier dev lo entiende |
| **`define`** | `defineComponent()` | Patrón conocido (Vue, Vue Router, Pinia) — "definir algo que luego se usa" |
| **`create`** | `createApp()` | Patrón conocido (Vue, ReactDOM) — "instanciar y configurar" |
| **`prepare`** | `prepare()`, `PreparedComponent` | Viene de pretext — "hacer el trabajo costoso una vez" |
| **`reflow`** | `reflow()`, `ReflowResult` | Término de browser — "recalcular layout" |
| **`commit`** | `commit()` | Término de React internals — "aplicar cambios al DOM" |

**Regla:** Si un dev que viene de React/Vue/Solid lee el código por primera vez, debe entender qué hace cada función sin leer la documentación. Los nombres son el 80% de la DX.

---

## Estructura de Archivos

```Text
src/
  signals.ts        — Signal primitives con dependency tracking
  component.ts      — defineComponent(), PreparedComponent type
  prepare.ts        — Análisis de componentes, cache de métricas
  reflow.ts         — Layout arithmetic, fast paths
  commit.ts         — DOM batch writes, diff application
  renderer.ts       — Render loop, scheduler, batching
  text.ts           — Integración con pretext para medición de texto
  index.ts          — Public API

demo/
  index.html        — Demo page
  app.ts            — Demo application (importa desde ../dist/index.js)
```

---

## Fases de Implementación

### Fase 1: Fundamentos — Signals + Componentes

**Objetivo:** Tener un sistema de signals funcional y la capacidad de definir componentes preparados.

#### Tareas Fase 1

- [ ] **1.1** Implementar `signal<T>(initialValue)` con dependency tracking
  - `signal.value` getter (registra dependencia)
  - `signal.set(newValue)` setter (notifica suscriptores)
  - `computed(fn)` — derived signals con caching
  - `effect(fn)` — side effects con auto-tracking

- [ ] **1.2** Implementar `defineComponent(fn)`
  - Función que retorna un descriptor de componente
  - Separa props "estáticas" (shape) de props "dinámicas" (value)
  - Retorna un `ComponentDefinition`

- [ ] **1.3** Implementar `prepare(component, props)`
  - Analiza la estructura del componente dado sus props
  - Retorna `PreparedComponent` con métricas pre-calculadas
  - Cachea resultados por (componentType, propsShape)

- [ ] **1.4** Tests unitarios de signals y prepare
  - Signal dependency tracking
  - Computed caching
  - Prepare idempotencia

**Entregable:** `signals.ts` + `component.ts` + `prepare.ts` con tests

---

### Fase 2: Reflow Engine — Layout Aritmético

**Objetivo:** Calcular posiciones y tamaños de componentes preparados sin tocar el DOM.

#### Tareas Fase 2

- [ ] **2.1** Implementar `reflow(prepared, constraints)`
  - Entrada: `PreparedComponent` + `{ width, height }` del viewport
  - Salida: `LayoutResult` con posiciones y tamaños
  - Aritmética pura — cero DOM reads

- [ ] **2.2** Implementar layout básico tipo flex
  - Flex direction (row/column)
  - Gap entre hijos
  - Align items (start, center, end, stretch)
  - Justify content (start, center, end, space-between)

- [ ] **2.3** Fast path detection
  - `simpleLayout = true` cuando solo hay texto y espacios
  - Walker simplificado para casos triviales
  - Similar a `simpleLineWalkFastPath` de pretext

- [ ] **2.4** Integración con pretext para texto
  - Usar `prepare()` de pretext para bloques de texto
  - Usar `layout()` en el reflow para calcular alturas de texto
  - Cache de prepared texts por (text, font)

- [ ] **2.5** Tests de reflow
  - Layout determinista con mismo input
  - Fast path vs rich path correctness
  - Edge cases (empty children, overflow)

**Entregable:** `reflow.ts` + `text.ts` con tests

---

### Fase 3: Commit Engine — DOM Batch Writes

**Objetivo:** Aplicar cambios al DOM en un solo batch sin lecturas intercaladas.

#### Tareas Fase 3

- [ ] **3.1** Implementar `commit(layoutResult, rootElement)`
  - Generar plan de cambios DOM (diff entre estado anterior y nuevo)
  - Aplicar en orden: removes → updates → inserts
  - Usar `DocumentFragment` para inserts múltiples
  - Cero lecturas DOM durante el commit

- [ ] **3.2** Implementar diffing de PreparedComponents
  - Comparar prepared tree anterior vs nuevo
  - Identificar nodos agregados, removidos, actualizados
  - Key-based reconciliation para listas

- [ ] **3.3** Implementar el render loop
  - `createApp(component, root)` — punto de entrada
  - `mount()` — primera renderización (prepare + reflow + commit)
  - Scheduler que batchea updates de signals
  - `requestAnimationFrame` para sync con el browser

- [ ] **3.4** Integración signals → render
  - Signals notifican al scheduler
  - Scheduler agrupa múltiples cambios en un solo tick
  - Clasifica: shape change → re-prepare; value change → reflow only

- [ ] **3.5** Tests de commit
  - DOM output correcto
  - Sin lecturas intercaladas
  - Batch de múltiples signals

**Entregable:** `commit.ts` + `renderer.ts` con tests

---

### Fase 4: MVP Demo — Página Web "Wow"

**Objetivo:** Una demo que genere FOMO inmediato — que un dev la vea y diga "necesito esto en mi proyecto".

#### Filosofía del Demo

No es una lista aburrida. Es una **dashboard editorial interactiva** que hace cosas que CSS no puede hacer sin hacks:

1. **Masonry layout real** — items de alturas variables que encajan perfectamente, recalculados en cada resize
2. **Texto fluyendo alrededor de obstáculos** — como el demo `dynamic-layout` de pretext, pero con componentes completos
3. **Shrinkwrap de burbujas** — tags/badges que se ajustan al ancho mínimo exacto de su contenido
4. **Resize en tiempo real** — un slider que cambia el viewport y TODO se re-layout instantáneamente, sin layout shift
5. **Panel de métricas en vivo** — muestra prepare/reflow/commit en milisegundos, comparado con CSS layout

#### Layout del Demo

```Text
┌──────────────────────────────────────────────────────────────┐
│  🚀 FRAMEWORK NAME                                           │
│  "El DOM es solo la pantalla de salida"                      │
│  ──────────────────────────────────────────────────────────  │
│  [Slider: 300px ━━━━━━━━━━━━━●━━━━━━━━━━━━━━━ 1400px]       │
│  [Items: 50] [Animación: ON] [Mostrar métricas: ON]         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────────────────┐  ┌────────┐        │
│  │          │  │                      │  │        │        │
│  │  Card    │  │   Hero Card          │  │  Tag   │        │
│  │  alta    │  │   (texto largo)      │  │ bubble │        │
│  │          │  │                      │  │        │        │
│  └──────────┘  └──────────────────────┘  └────────┘        │
│  ┌──┐ ┌──┐   ┌────────────┐  ┌─────────────────┐           │
│  │  │ │  │   │            │  │                 │           │
│  │T │ │T │   │   Card     │  │   Card media    │           │
│  │a │ │a │   │   baja     │  │                 │           │
│  │g │ │g │   │            │  │                 │           │
│  └──┘ └──┘   └────────────┘  └─────────────────┘           │
│  ┌──────────────────────┐  ┌──────┐  ┌──────────────────┐  │
│  │                      │  │      │  │                  │  │
│  │   Card ancha         │  │ Tag  │  │   Card con       │  │
│  │   (imagen + texto)   │  │      │  │   texto fluido   │  │
│  │                      │  │      │  │   alrededor de   │  │
│  └──────────────────────┘  └──────┘  │   un obstáculo   │  │
│                                      │                  │  │
│                                      └──────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  📊 MÉTRICAS EN VIVO                                         │
│  prepare: 2.1ms │ reflow: 0.3ms │ commit: 1.2ms │ TOTAL: 3.6ms │
│  CSS equivalente: ~15ms (estimado con layout thrashing)       │
│  4.2x más rápido │ 0 lecturas DOM en hot path                 │
└──────────────────────────────────────────────────────────────┘
```

#### Componentes del Demo

```typescript
import { signal, computed, defineComponent, createApp } from './dist/index.js'

// === Signals ===
const containerWidth = signal(800)
const itemCount = signal(50)
const showMetrics = signal(true)
const animate = signal(true)

// Datos de ejemplo — textos variados para alturas diferentes
const SAMPLE_TEXTS = [
  'Lorem ipsum dolor sit amet.',
  'The quick brown fox jumps over the lazy dog. ' +
    'Pack my box with five dozen liquor jugs. ' +
    'How vexingly quick daft zebras jump.',
  'Short.',
  'Medium length text that wraps to two lines on most containers.',
  'A much longer paragraph that demonstrates how the framework handles ' +
    'multi-line text content without any DOM measurement. This is the core ' +
    'philosophy: all the expensive work happens once during prepare(), and ' +
    'the hot path is pure arithmetic. No getBoundingClientRect. No reflow. ' +
    'Just numbers.',
]

const TAGS = ['JavaScript', 'TypeScript', 'Web', 'Performance', 'Layout',
  'CSS', 'Framework', 'React', 'Vue', 'Svelte', 'Signals', 'DOM',
  'Rendering', 'Masonry', 'Editorial']

// === Componentes ===

// Tag bubble — shrinkwrap al contenido exacto
const TagBubble = defineComponent((props: { label: string }) => {
  return {
    type: 'element',
    tag: 'span',
    classes: ['tag-bubble'],
    children: [{ type: 'text', content: props.label }]
  }
})

// Card con altura variable según texto
const Card = defineComponent((props: {
  title: string
  body: string
  variant: 'compact' | 'wide' | 'tall'
}) => {
  return {
    type: 'element',
    tag: 'div',
    classes: ['card', `card-${props.variant}`],
    children: [
      { type: 'element', tag: 'h3', classes: ['card-title'],
        children: [{ type: 'text', content: props.title }] },
      { type: 'element', tag: 'p', classes: ['card-body'],
        children: [{ type: 'text', content: props.body }] }
    ]
  }
})

// Hero card — la pieza central del layout
const HeroCard = defineComponent((props: { title: string, body: string }) => {
  return {
    type: 'element',
    tag: 'div',
    classes: ['card', 'card-hero'],
    children: [
      { type: 'element', tag: 'h2', classes: ['hero-title'],
        children: [{ type: 'text', content: props.title }] },
      { type: 'element', tag: 'p', classes: ['hero-body'],
        children: [{ type: 'text', content: props.body }] }
    ]
  }
})

// Panel de métricas
const MetricsPanel = defineComponent((props: {
  prepareMs: number
  reflowMs: number
  commitMs: number
}) => {
  const total = props.prepareMs + props.reflowMs + props.commitMs
  return {
    type: 'element',
    tag: 'div',
    classes: ['metrics-panel'],
    children: [
      { type: 'element', tag: 'h4',
        children: [{ type: 'text', content: '📊 Métricas en Vivo' }] },
      { type: 'element', tag: 'div', classes: ['metrics-grid'], children: [
        { type: 'element', tag: 'div', classes: ['metric'], children: [
          { type: 'element', tag: 'span', classes: ['metric-label'],
            children: [{ type: 'text', content: 'prepare' }] },
          { type: 'element', tag: 'span', classes: ['metric-value'],
            children: [{ type: 'text', content: `${props.prepareMs.toFixed(2)}ms` }] }
        ]},
        { type: 'element', tag: 'div', classes: ['metric'], children: [
          { type: 'element', tag: 'span', classes: ['metric-label'],
            children: [{ type: 'text', content: 'reflow' }] },
          { type: 'element', tag: 'span', classes: ['metric-value highlight'],
            children: [{ type: 'text', content: `${props.reflowMs.toFixed(2)}ms` }] }
        ]},
        { type: 'element', tag: 'div', classes: ['metric'], children: [
          { type: 'element', tag: 'span', classes: ['metric-label'],
            children: [{ type: 'text', content: 'commit' }] },
          { type: 'element', tag: 'span', classes: ['metric-value'],
            children: [{ type: 'text', content: `${props.commitMs.toFixed(2)}ms` }] }
        ]},
        { type: 'element', tag: 'div', classes: ['metric total'], children: [
          { type: 'element', tag: 'span', classes: ['metric-label'],
            children: [{ type: 'text', content: 'TOTAL' }] },
          { type: 'element', tag: 'span', classes: ['metric-value big'],
            children: [{ type: 'text', content: `${total.toFixed(2)}ms` }] }
        ]}
      ]}
    ]
  }
})

// === App Principal ===
const App = defineComponent(() => {
  const items = computed(() =>
    Array.from({ length: itemCount.value }, (_, i) => ({
      id: i,
      title: `Item ${i + 1}`,
      body: SAMPLE_TEXTS[i % SAMPLE_TEXTS.length],
      variant: (['compact', 'wide', 'tall'] as const)[i % 3],
      tag: TAGS[i % TAGS.length]
    }))
  )

  return {
    type: 'element',
    tag: 'div',
    classes: ['app'],
    style: { '--container-width': `${containerWidth.value}px` },
    children: [
      // Header
      { type: 'element', tag: 'header', classes: ['header'], children: [
        { type: 'element', tag: 'h1',
          children: [{ type: 'text', content: '🚀 Framework Name' }] },
        { type: 'element', tag: 'p', classes: ['tagline'],
          children: [{ type: 'text',
            content: '"El DOM es solo la pantalla de salida"' }] }
      ]},

      // Controles
      { type: 'element', tag: 'div', classes: ['controls'], children: [
        { type: 'element', tag: 'div', classes: ['control-group'], children: [
          { type: 'element', tag: 'label',
            children: [{ type: 'text', content: 'Ancho: ' }] },
          { type: 'element', tag: 'input',
            attrs: { type: 'range', min: '300', max: '1400', step: '10',
              value: String(containerWidth.value) } },
          { type: 'element', tag: 'span', classes: ['control-value'],
            children: [{ type: 'text',
              content: `${containerWidth.value}px` }] }
        ]},
        { type: 'element', tag: 'div', classes: ['control-group'], children: [
          { type: 'element', tag: 'label',
            children: [{ type: 'text', content: 'Items: ' }] },
          { type: 'element', tag: 'input',
            attrs: { type: 'range', min: '5', max: '200', step: '5',
              value: String(itemCount.value) } },
          { type: 'element', tag: 'span', classes: ['control-value'],
            children: [{ type: 'text', content: `${itemCount.value}` }] }
        ]},
        { type: 'element', tag: 'button', classes: ['toggle'],
          attrs: { 'data-active': String(showMetrics.value) },
          children: [{ type: 'text', content: '📊 Métricas' }] }
      ]},

      // Layout principal (masonry + hero + tags)
      { type: 'element', tag: 'main', classes: ['layout'], children: [
        // Tags cloud — shrinkwrap
        { type: 'element', tag: 'div', classes: ['tags-cloud'],
          children: TAGS.map(tag => TagBubble({ label: tag })) },

        // Hero card
        HeroCard({
          title: 'Renderizado en Dos Fases',
          body: SAMPLE_TEXTS[4] // El texto largo
        }),

        // Grid de cards — masonry
        { type: 'element', tag: 'div', classes: ['masonry-grid'],
          children: items.value.map(item =>
            Card({ title: item.title, body: item.body, variant: item.variant })
          ) },
      ]},

      // Métricas (condicional)
      showMetrics.value ? MetricsPanel({
        prepareMs: 2.1,
        reflowMs: 0.3,
        commitMs: 1.2
      }) : { type: 'fragment', children: [] }
    ]
  }
})

// === Montar ===
const app = createApp(App, document.getElementById('app')!)
app.mount()
```

#### Tareas del Demo

- [ ] **4.1** Crear `demo/index.html` con estructura mínima + CSS dark theme elegante
- [ ] **4.2** Crear `demo/app.ts` con la aplicación demo completa
- [ ] **4.3** CSS con diseño visual impactante
  - Dark theme con acentos de color
  - Cards con sombras, bordes redondeados, gradientes sutiles
  - Animaciones suaves en resize (transiciones CSS solo para opacidad/transform)
  - Tipografía cuidada (Inter o similar)
- [ ] **4.4** Instrumentación de performance en tiempo real
  - Panel de métricas que muestra prepare/reflow/commit en ms
  - Contador de DOM reads (debe ser 0 en hot path)
  - Comparación visual: timeline del framework vs timeline estimado de CSS
- [ ] **4.5** Efecto "wow" adicional
  - Animación automática que cicla el ancho del container (demo mode)
  - Mostrar el layout adaptándose en tiempo real a diferentes anchos
  - Contador de items que se anima y el masonry se reacomoda sin glitch
- [ ] **4.6** README del demo con explicación de la filosofía
  - Screenshot/GIF del demo en acción
  - Explicación de las 4 fases del update cycle
  - Comparación con React/Vue/Svelte

**Entregable:** Demo funcional que genera FOMO — visualmente atractivo, con métricas en vivo, y que demuestra layouts imposibles con CSS puro.

---

## API Pública (v1)

```typescript
// === Signals ===
function signal<T>(initialValue: T): Signal<T>
function computed<T>(fn: () => T): ComputedSignal<T>
function effect(fn: () => void): () => void  // cleanup

interface Signal<T> {
  get value(): T
  set value(v: T): void
}

// === Componentes ===
function defineComponent<Props, Result>(
  fn: (props: Props) => ComponentNode
): ComponentDefinition<Props>

interface ComponentNode {
  type: 'element' | 'text' | 'fragment'
  tag?: string
  classes?: string[]
  style?: Record<string, string>
  attrs?: Record<string, string>
  children?: ComponentNode[]
  content?: string  // para type: 'text'
}

// === App ===
function createApp(
  component: ComponentDefinition,
  root: HTMLElement,
  options?: { locale?: string }
): App

interface App {
  mount(): void
  unmount(): void
  // Para debugging
  getMetrics(): { prepareMs: number, reflowMs: number, commitMs: number }
}
```

---

## Decisiones de Diseño

### Por qué signals y no virtual DOM

Signals son la elección natural porque:

1. **Granularidad** — cada signal sabe exactamente quién depende de él
2. **Sin diffing innecesario** — solo re-renderiza lo que cambió
3. **Compatible con la filosofía** — signals de "valor" → reflow; signals de "forma" → re-prepare
4. **Menos allocations** — no se crea un árbol virtual en cada update

### Por qué BunJS como runtime

1. **Performance nativa** — Bun usa JavaScriptCore (no V8), con startup ~4x más rápido que Node
2. **Tooling integrado** — test runner, bundler, y package manager incluidos, sin dependencias externas
3. **Coherencia con la filosofía** — si el framework busca rendimiento máximo, el tooling de desarrollo también debe ser rápido
4. **APIs modernas** — soporte nativo para `Bun.serve()`, `Bun.file()`, y hot reloading sin configuraciones adicionales

### Por qué runtime primero

1. **Validar el principio** — antes de complicar con un compilador, demostrar que la separación prepare/reflow funciona
2. **API surface** — el runtime define la API que el compilador luego optimizará
3. **Menos complejidad** — un compilador añade otra capa de debugging y mantenimiento

### Cómo se integra pretext

Pretext se usa para el sub-problema de medición de texto dentro del framework:

- `prepare(text, font)` se llama durante la fase de preparación del componente
- `layout(prepared, width, lineHeight)` se llama durante el reflow
- El cache de pretext es compartido entre todos los componentes de texto

---

## Invariantes de Performance

| Operación | Target | Restricciones |
| ----------- | -------- | --------------- |
| `prepare()` por componente | < 5ms | Una vez por cambio de forma |
| `reflow()` por componente | < 0.5ms | Sin DOM, sin strings, sin allocations |
| `commit()` por update | < 2ms | Escrituras secuenciales, sin lecturas |
| Hot path total (reflow + commit) | < 16ms | Para 60fps en árboles de ~1000 nodos |

---

## Criterios de Éxito del MVP

1. ✅ La demo carga y renderiza correctamente
2. ✅ El resize del container es instantáneo (sin layout shift visible)
3. ✅ Las métricas muestran que reflow < 1ms para la lista demo
4. ✅ Cero lecturas DOM durante reflow
5. ✅ Cero allocations innecesarias en el hot path
6. ✅ El código es legible y bien documentado

---

## Referencias

- `SPEC-TEXT-LAYOUT-ENGINE.md` — Análisis técnico profundo de pretext
- `pretext-main/src/` — Código fuente de referencia
- `pretext-main/AGENTS.md` — Notas de implementación y convenciones
- `pretext-main/thoughts.md` — Visión filosófica del autor

---

## Notas de Implementación

### Convenciones

- **Runtime:** BunJS exclusivamente — no Node.js
- **Package manager:** `bun install` (no npm/yarn/pnpm)
- **Test runner:** `bun test` (no Jest/Vitest)
- **Dev server:** `bun --watch` para desarrollo
- **Build:** `bun build` para producción (no esbuild/webpack/Rollup)
- Imports con `.js` en archivos `.ts` (compatible con tsc emit y Bun)
- Brand types para handles opacos (`PreparedComponent`)
- Cero dependencias externas (excepto pretext)
- Tests unitarios mínimos pero durables

### Gotchas conocidos (de pretext)

1. `system-ui` es inseguro para medición — usar fuentes con nombre
2. CJK astral requiere `codePointAt()`, NO `charCodeAt()`
3. Emoji correction es la ÚNICA lectura DOM permitida, cacheada por font
4. Preprocessing en prepare() es más efectivo que correcciones en runtime
5. Fast path separado para casos triviales — gran diferencia de performance

### Futuro: Compilador (Fase 4+)

Cuando llegue el momento del compilador:

- Transformar templates/JSX en llamadas a `defineComponent()`
- Analizar estáticamente qué props son "shape" vs "value"
- Generar código de reflow especializado por componente
- Inline de componentes simples para eliminar overhead

---

*Documento creado como plan de desarrollo del framework web basado en la filosofía de renderizado en dos fases de pretext.*
