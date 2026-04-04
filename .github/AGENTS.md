# Axiom — Agent Instructions

> **"El DOM es solo la pantalla de salida"**

Framework web con renderizado en dos fases. Todos los cálculos ocurren en memoria. El hot path es aritmética pura. Cero lecturas DOM.

---

## Filosofía Central

**Separar el trabajo costoso (que solo depende de los datos) del trabajo barato (que solo depende del layout actual).**

El DOM no es la fuente de verdad. Es write-only output después de que todos los cálculos terminaron.

### El Mantra

```Text
prepare()  → trabajo costoso UNA vez (análisis, métricas, estructura)
reflow()   → aritmética pura en cada frame (posiciones, tamaños)
commit()   → escrituras DOM batcheadas (removes → updates → inserts)
```

### Lo que NO es Axiom

- ❌ No es un virtual DOM framework
- ❌ No lee `getBoundingClientRect()` en el hot path
- ❌ No depende del DOM para cálculos de layout
- ❌ No hace layout thrashing

### Lo que SÍ es Axiom

- ✅ Signals con dependency tracking granular
- ✅ Componentes preparados (opacos, brand types)
- ✅ Layout aritmético con fast paths
- ✅ Commit batched sin lecturas intercaladas
- ✅ Masonry, flex, columnas — todo calculado en memoria

---

## Arquitectura

```Text
┌─────────────────────────────────────────────────────────────┐
│                     PUBLIC API                               │
│  signal()  computed()  effect()  defineComponent()  createApp() │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   signals.ts         component.ts        app.ts
   Reactive core      Component def       Mount + update loop
   Push + pull        Callable defs       Scheduler integration
         │                  │                  │
         ▼                  ▼                  ▼
   prepare.ts         reflow.ts          commit.ts
   Tree analysis      Layout arithmetic  DOM batch writes
   Metrics cache      Fast paths         Diff + apply
                      Flex engine
```

### El ciclo de actualización

```Text
Signal cambia
    │
    ▼
Efecto re-ejecuta → component._fn() lee signals (dependencias)
    │
    ▼
scheduleRender() → batchea en rAF (last write wins)
    │
    ▼
performUpdate():
  1. prepare()   → analiza estructura nueva
  2. reflow()    → calcula posiciones/tamaños (aritmética pura)
  3. commit()    → aplica cambios al DOM (batch, sin lecturas)
```

---

## Estructura de Archivos

```Text
src/
  signals.ts        — Signal primitives (push effects + pull computed)
  component.ts      — defineComponent() — callable component definitions
  prepare.ts        — Tree analysis, metrics, brand types
  reflow.ts         — Layout orchestration, routes to fast-path or flex
  fast-path.ts      — Simple top-to-bottom block layout
  flex.ts           — Flex layout (row/column, gap, justify, align, padding)
  diff.ts           — DOM diffing with key reconciliation
  commit.ts         — DOM tree creation + batched apply
  scheduler.ts      — rAF batching with generation invalidation
  app.ts            — createApp(), mount, update loop, metrics
  types.ts          — Shared types (zero dependencies)
  index.ts          — Public API surface

demo/
  app.ts            — Demo application with masonry layout
  style.css         — Dark editorial theme
  index.html        — Demo page
  server.ts         — Bun dev server
```

---

## Convenciones de Código

### Imports

- **Siempre con extensión `.js`** en archivos `.ts` (compatible con tsc emit y Bun)
- Imports relativos con `./` o `../`
- Types importados con `import type { ... }`

### Naming

| Patrón | Ejemplos | Por qué |
| -------- | ---------- | --------- |
| `signal` | `signal()`, `computed()`, `effect()` | Término universal de reactividad |
| `define` | `defineComponent()` | Patrón conocido (Vue, Pinia) |
| `create` | `createApp()`, `createLayoutResult()` | Instanciar y configurar |
| `prepare` | `prepare()`, `PreparedComponent` | Trabajo costoso una vez |
| `reflow` | `reflow()`, `LayoutResult` | Término de browser — recalcular layout |
| `commit` | `commitFull()`, `applyOps()` | Término de React internals |

**Regla:** Si un dev de React/Vue/Solid lee el código, debe entender qué hace cada función sin documentación.

### Types

- **Brand types** para handles opacos: `declare const preparedBrand: unique symbol`
- **`as const`** para discriminantes de uniones: `type: 'element' as const`
- **`Float32Array`** para arrays de layout (x, y, width, height) — cero allocations innecesarias
- Interfaces en `types.ts`, implementación en módulos específicos

### Estructura de archivos

- Separadores de sección con `// ============================================================`
- Comentarios de sección: `// Public API`, `// Internal`
- JSDoc solo para API pública
- Código auto-documentado con nombres descriptivos

---

## Invariantes de Performance

| Operación | Target | Restricciones |
| ----------- | -------- | -------------- |
| `prepare()` por componente | < 5ms | Una vez por cambio de forma |
| `reflow()` por componente | < 0.5ms | Sin DOM, sin strings, sin allocations |
| `commit()` por update | < 2ms | Escrituras secuenciales, sin lecturas |
| Hot path total | < 16ms | Para 60fps en árboles de ~1000 nodos |

### Hot Path Prohibiciones

```Text
❌ DOM reads (getBoundingClientRect, offsetHeight, clientWidth en hot path)
❌ Canvas calls (measureText)
❌ String operations (concat, split, template literals)
❌ Allocations innecesarias (arrays nuevos, objetos temporales)
❌ Cualquier cosa que fuerce layout reflow
```

### Hot Path Permitido

```Text
✅ Aritmética sobre Float32Array
✅ Map/Set lookups
✅ Comparaciones
✅ Index access
```

---

## Layout Engine

### Posiciones relativas al padre

Todas las posiciones (`x`, `y`) son **relativas al padre directo**, no absolutas desde el root. El DOM anida los hijos dentro de los padres, y `position: absolute` + `translate()` se acumula naturalmente.

### Cálculo de heights (bottom-up)

- **Columna:** height = suma de heights de hijos + gaps
- **Fila:** height = máximo de heights de hijos
- **Padre sin height explícito:** se calcula automáticamente desde los hijos
- **`measureFlex`** calcula el height del padre al final — `reflow.ts` NO debe sobreescribirlo

### Fast path vs Flex path

- **Fast path** (`measureSimple`): top-to-bottom block layout. Sin flex, sin padding, sin justify/align.
- **Flex path** (`measureFlex`): flexDirection, gap, justifyContent, alignItems, padding.
- **Detección:** si un nodo tiene `layout` props con flex/gap/justify/align → flex path. Si no y `metrics.simpleLayout` → fast path.

### Layout props

```typescript
interface LayoutProps {
  flexDirection?: 'row' | 'column'
  gap?: number
  justifyContent?: 'start' | 'center' | 'end' | 'space-between'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  width?: number
  height?: number
  padding?: number
}
```

**Importante:** Los componentes del demo DEBEN tener `layout` props para que el framework sepa cómo distribuirlos. Sin layout props, el framework asume column simple (fast path).

---

## Signals

### Dos tipos de signals

- **`signal<T>(value)`** — mutable, push-based (notifica subscribers al cambiar)
- **`computed<T>(fn)`** — read-only, pull-based (lazy evaluation con version check)

### Effect

- Se ejecuta inmediatamente al crearse
- Re-ejecuta cuando cualquier signal leído cambia
- Soporta cleanup functions (return value)
- **Protección contra infinite loops:** depth limit de 100

### Computed

- Lazy evaluation — solo se re-evalúa si está stale
- Detección de dependencias circulares
- Transitive dependency tracking (registra deps de los computed en el effect activo)

---

## Componentes

### defineComponent

```typescript
const Card = defineComponent((props: { title: string; body: string }) => ({
  type: 'element' as const,
  tag: 'article',
  classes: ['card'],
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [
    { type: 'element' as const, tag: 'h3', children: [{ type: 'text' as const, content: props.title }] },
    { type: 'element' as const, tag: 'p', children: [{ type: 'text' as const, content: props.body }] },
  ],
}))
```

- Es **callable directamente**: `Card({ title: '...', body: '...' })`
- Retorna un `ComponentNode` que se usa en `children` arrays
- El `_fn` interno se usa para re-evaluar cuando signals cambian

### PreparedComponent

- Handle **opaco** con brand type — no exponer estructura interna
- Contiene: estructura del árbol, métricas pre-calculadas, text handles
- Indexado secuencialmente (0 = root, 1..N = hijos en orden de recorrido)

---

## Commit / DOM

### Estrategia

- **Root container:** `position: relative`, sin `overflow: hidden` (el framework calcula heights explícitos)
- **Todos los elementos:** `position: absolute` + `translate(x, y)` + `width`/`height`
- **Text nodes:** `createTextNode()`, sin estilos de layout
- **Fragments:** transparentes — solo procesan hijos

### Orden de operaciones (diff incremental)

1. **Removes** — liberar nodos DOM
2. **Updates/Moves** — modificar existentes in-place
3. **Inserts** — DocumentFragment para batching

### Root height

El height calculado del root node (índice 0) se aplica al contenedor DOM: `root.style.height = \`${rootHeight}px\``. Esto asegura que el contenido sea visible sin`overflow: hidden`.

---

## Testing

### Stack

- **Runtime:** BunJS exclusivamente
- **Test runner:** `bun test`
- **DOM en tests:** Happy-DOM (configurado en bunfig o como polyfill)

### Convenciones

- Tests unitarios mínimos pero durables
- Fake pretext para tests de layout (sin canvas real)
- Tests de integración: signal → effect → prepare
- **No acordar con `overflow: hidden`** en el root — el framework calcula heights explícitos

### Gotchas conocidos

1. `system-ui` es inseguro para medición — usar fuentes con nombre
2. CJK astral requiere `codePointAt()`, NO `charCodeAt()`
3. Emoji correction es la ÚNICA lectura DOM permitida, cacheada por font
4. Fast path separado para casos triviales — gran diferencia de performance
5. Preprocessing en prepare() es más efectivo que correcciones en runtime

---

## Anti-patterns (NO hacer)

| Anti-pattern | Por qué | Equivalente |
| -------------- | --------- | ------------- |
| Leer DOM en reflow | Reintroduce reflows al hot path | `getBoundingClientRect()` en loop |
| Mover lógica compleja al hot path | Regresa el benchmark | Validaciones exhaustivas por frame |
| Lookup tables para valores de ambiente | No confiables cross-browser | Hardcodear font metrics |
| DOM-based measurement en prepare | Reintroduce reflows | Elementos ocultos para medir |
| Micro-optimizaciones sin evidencia | No atacan el bottleneck real | Pair correction models |
| Strings en el hot path | Allocations + parsing lento | Template literals en reflow |

---

## Decisiones de Diseño

### Por qué signals y no virtual DOM

1. **Granularidad** — cada signal sabe exactamente quién depende
2. **Sin diffing innecesario** — solo re-renderiza lo que cambió
3. **Compatible con la filosofía** — value changes → reflow; shape changes → re-prepare
4. **Menos allocations** — no se crea un árbol virtual en cada update

### Por qué BunJS

1. **Performance nativa** — JavaScriptCore, startup ~4x más rápido que Node
2. **Tooling integrado** — test runner, bundler, package manager incluidos
3. **Coherencia** — si el framework busca rendimiento máximo, el tooling también

### Por qué runtime primero

1. **Validar el principio** — demostrar que la separación prepare/reflow funciona
2. **API surface** — el runtime define la API que el compilador luego optimizará
3. **Menos complejidad** — un compilador añade otra capa de debugging

---

## Roadmap

| Fase | Qué | Estado |
| ------ | ----- | -------- |
| **Fase 1** | Signals + Componentes | ✅ Completado |
| **Fase 2** | Reflow Engine (layout aritmético) | ✅ Completado |
| **Fase 3** | Commit Engine (DOM batch writes) | ✅ Completado |
| **Fase 4** | MVP Demo (masonry + métricas) | ✅ Completado |
| **Fase 5+** | Compilador + Runtime | 📋 Futuro |

---

## Referencias

- `PLAN-DESARROLLO.md` — Plan completo de desarrollo
- `SPEC-TEXT-LAYOUT-ENGINE.md` — Análisis técnico de pretext (inspiración)
- `pretext-main/` — Código fuente de referencia
