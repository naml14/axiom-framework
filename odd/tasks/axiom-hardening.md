# Feature: axiom-hardening

> **Origen**: Auditoría arquitectónica del 2026-01-09 contra los axiomas del proyecto
> (`README.md` + `docs/ARCHITECTURE.md` + `odd/tasks/axiom-premise-guard.md`),
> extendida para incluir edge cases de seguridad, usabilidad y cobertura del demo.
> **Decisión de alcance**: Documentar hallazgos + planear remediación + corregir el demo
> para que muestre TODAS las características del proyecto.

> **Estado de remediación (2026-09-22)**: este documento es el **catálogo histórico** de la
> auditoría y no se reescribe. El estado real de entrega, las exclusiones y las salvedades
> viven en `odd/tasks/axiom-hardening-plan.md` → «Estado de ejecución»; el seguimiento de
> esta sincronización documental, en `odd/tasks/hardening-docs-sync.md`.
> Resumen: Fase 0 y Fase 1 entregadas (con C-1 parcial y el matiz de F1-T7), Fase 2
> entregada salvo **H-7**, excluida porque su implementación congelaba el demo, y Fase 3
> sin iniciar. Rama de entrega: `integration/hardening-good-rollup`.

## Premisas auditadas

El proyecto axiom-framework declara:

- **DOM = output screen**: cero lecturas DOM en hot path (`reflow → commit`).
- **Zero-allocation hot path**: `Float32Array` reciclado vía `pool.ts` y `engines/scratch.ts`.
- **Renderizado bifásico**: `prepare()` (cachea métricas) → `reflow()` (aritmética pura) → `commit()` (DOM batch writes).
- **Medición de texto unificada**: `CHAR_WIDTH = 8`, `WORD_WRAP_FACTOR = 1.4`.
- **API stability**: exports públicos deben estar en `STABILITY.md`.
- **Seguridad XSS-first**: atributos saneados, URL schemes bloqueados.
- **Cobertura del demo**: el demo debe mostrar TODAS las features públicas.

## Hallazgos por severidad

Total: **38 hallazgos** (7 críticos, 13 altos, 13 medios, 5 bajos).

---

## 🔴 CRÍTICOS

### C-1. `data:` URLs legítimas (base64) bloqueadas por el sanitizer

**Archivos**: `src/core/attrs.ts:51`, `src/ssr.ts:115, 147, 172, 222`
**Evidencia**:
```ts
// src/core/attrs.ts:51
const DANGEROUS_URL_SCHEME_RE = /^\s*(javascript|data|vbscript|file)\s*:/i
```
La regex es demasiado amplia: bloquea `data:image/png;base64,…`, `data:image/svg+xml,…`,
`data:audio/mp3;base64,…`. **Rompe caso de uso común de imágenes inline base64**.

- `tests/edge-cases.test.ts:466-467` confirma bloqueo de `data:text/css,…`.
- `tests/ssr.test.ts:252-266` confirma bloqueo de `data:text/html` (correcto).
- **No existe ningún test** (`grep "data:image"` en `tests/`, `src/`, `docs/` → 0 matches)
  que valide que `data:image/png;base64,…` se permita.
- En SSR, además, la regex `\burl\s*\(/gi` de `escapeStyleText` (`ssr.ts:222`)
  strip cualquier `url(…)` en estilos inline, **incluso imágenes base64 legítimas**.

**Por qué importa la idea central**: la seguridad XSS está sobre-protegida al punto
de romper una feature estándar del web (imágenes inline). Es un trade-off mal calibrado.

### C-2. `for (const key in …)` itera prototype chain — XSS vía polución de prototipo

**Archivo**: `src/syntax/h.ts:189, 271`
**Evidencia**:
```ts
// src/syntax/h.ts:189 (applyKnownAttrs)
for (const key in source) { … }
// src/syntax/h.ts:271 (extractHandlers)
for (const key in props) { … }
```
`for...in` itera propiedades enumerables del prototype chain. Si un usuario pasa
`{ __proto__: { 'aria-hidden': 'evil' } }`, atributos heredados terminan en el DOM.
Anti-patrón conocido de XSS.

**Por qué importa la idea central**: el framework promete "sanitización XSS-first"
pero el syntax layer (el path recomendado para escribir componentes) tiene un hole.

### C-3. Timer module-scope en `server.ts` no respeta ciclo de vida

**Archivo**: `src/server.ts:164-170, 155`
**Evidencia**:
```ts
// src/server.ts:155
const requestCounts = new Map<string, { count: number; resetAt: number }>()
// src/server.ts:164
const pruneTimer = setInterval(() => { … }, RATE_WINDOW)
```
- `setInterval` arranca **al importar el módulo**, aunque nunca se llame `createServer()`.
- `requestCounts` (también module-scope) persiste entre instancias, contaminando
  rate-limits entre servidores.
- El timer mantiene Node.js vivo: en SSR/edge runtimes bloquea shutdown.

### C-4. DOM reads en cada `performUpdate()` no cubiertos por el enforcement test

**Archivo**: `src/app.ts:124-131`
**Evidencia**:
```ts
function getConstraints(): LayoutConstraints {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : undefined
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : undefined
  return {
    maxWidth: root.clientWidth || 800,
    maxHeight: root.clientHeight || 600,
    viewportWidth, viewportHeight,
  }
}
```
- `tests/architecture/hot-path-dom-reads.test.ts:6-11` **solo escanea** `src/render/`.
- **NO escanea `src/app.ts`**.
- Comentario en `app.ts:111-122` dice "not per frame, not in the hot path", pero
  `performUpdate` se ejecuta cada vez que una signal cambia (incluyendo animaciones
  a 60fps).
- 4 DOM reads por update cycle = 240 reads/seg en app reactiva animada.

**Por qué importa la idea central**: el test pasa pero la promesa
"zero DOM reads in hot path" se rompe en cada update cycle.

### C-5. Documentación contradice el código en `cssManaged`

**Archivos**: `src/features/portal.ts:22-32` vs `src/core/types.ts:57`,
`src/render/commit.ts:568`, `src/render/prepare.ts:254`, `CHANGELOG.md:230`
**Evidencia**:
```ts
// src/features/portal.ts:22-32
// ## Future: `cssManaged` flag (not yet implemented — see issue #9)
// createPortal(children, target, { cssManaged: false })
```
Pero:
- `core/types.ts:57`: `PortalNode.cssManaged?: boolean` ← existe
- `portal.ts:52-60`: `createPortal` ya acepta `options.cssManaged` ← implementado
- `prepare.ts:254`, `commit.ts:568-569`, `diff.ts:86,96,121`, `reflow.ts:48-49,56` ← procesado
- `CHANGELOG.md:230`: "add cssManaged flag for portal children layout management" ← commited

**Por qué importa la idea central**: documentación desactualizada genera desconfianza
en toda la API pública.

### C-6. `sanitizeAttrs` siempre alloca, incluso cuando no hay cambios

**Archivo**: `src/core/attrs.ts:189-220`
**Evidencia**:
```ts
const result: Record<string, string> = {}    // ← allocation always
// …
return hasChanges ? result : attrs           // ← returns original solo si !hasChanges
```

### C-7. `validate()` usa `setTimeout` directo, ignorando el scheduler configurable

**Archivo**: `src/features/forms.ts:177`
**Evidencia**:
```ts
debounceTimer = setTimeout(async () => { … }, debounceMs)
```
- `animation.ts:6-10` dice "NO rAF, NO timers. All scheduling through the scheduler fn".
- `createApp` expone `options.scheduler` (configurable, testeable).
- `forms.ts` lo ignora: no testeable, no cancelable en cleanup del app, race con shutdown.

---

## 🟠 ALTOS

### H-1. `composedTransform` y `${width}px` alloca strings por nodo por update

**Archivo**: `src/render/commit.ts:379, 449-450`
**Evidencia**:
```ts
return `translate(${x}px,${y}px) var(--animation-transform,)`  // allocation cada vez
el.style.width = `${width}px`
el.style.height = `${height}px`
```
1000 nodos × update = 1000 strings + 2000 strings. Hot path violates "no strings".

### H-2. `getPreparedChildren`/`getChildren` alloca array en cada acceso

**Archivo**: `src/render/prepare.ts:303-306, 336-339`
**Evidencia**:
```ts
return unbrandPrepared(prepared).children.map(c => brandPrepared(c))  // allocation cada call
```
~10,000 array allocations por update en árbol de 1000 nodos.

### H-3. `diff.ts` crea 4-5 Maps/Sets por cada `fullDiff`

**Archivo**: `src/render/diff.ts:90, 207, 209, 320, 325, 511, 522`

### H-4. `grid.ts:buildCellKey` alloca string por cada celda ocupada

**Archivo**: `src/render/engines/grid.ts:340, 366-373`
```ts
function buildCellKey(row: number, col: number): string {
  return `${row}:${col}`      // allocation cada call
}
```
Grid 4×25 con rowSpan=2 → 800+ string allocations por grid layout.

### H-5. `grid.ts:buildRowOffsets` alloca array por cada call

**Archivo**: `src/render/engines/grid.ts:438-447`

### H-6. `fast-path.ts` filter alloca array por call

**Archivo**: `src/render/engines/fast-path.ts:33`
```ts
const realChildren = children.filter(c => getNodeType(c) !== 'portal')
```

### H-7. `signals.ts:notifySubscribers` alloca array por cada write

**Archivo**: `src/reactivity/signals.ts:100`
```ts
const subs = [...node._subs]    // allocation por write
```

### H-8. `applyStyleToElement` alloca entries por cada call

**Archivo**: `src/features/style.ts:187-194`
```ts
for (const [key, value] of Object.entries(props)) { … }    // entries allocation
```

### H-9. `validateStyleProps` no se llama — el whitelist se rompe en runtime

**Archivo**: `src/features/style.ts:166-176`, `src/render/commit.ts:726`
- Nadie llama a `validateStyleProps`. Un `key: 'evilProp'` terminaría asignado.

### H-10. `STABILITY.md` dice "132 stables" pero `axiom-premise-guard.md` aún lo lista como gap

**Archivos**: `docs/STABILITY.md:11, 32` vs `odd/tasks/axiom-premise-guard.md:78-90`
- `getLayoutPoolSize` ahora es stable; el premise-guard quedó stale.

### H-11. `resetIndexCounter` es export público no-op sin `@deprecated`

**Archivo**: `src/render/prepare.ts:36-43`
- Cambio breaking silencioso para usuarios v0.x que lo llamaban.

### H-12. `portal.ts` no maneja portals cuyo target está desconectado en CSR

**Archivo**: `src/render/commit.ts:259-265, 421, 587`
- Solo se valida en hydration. En `commitFull`, si `portalTarget` está detached,
  `appendChild` lanza `NotFoundError`.

### H-13. `applyOps` y `commitFull` no verifican `parentNode` antes de `appendChild`

**Archivo**: `src/render/commit.ts:421, 587`

---

## 🟡 MEDIOS

### M-1. `VALID_JUSTIFY_VALUES` y `VALID_ALIGN_VALUES` requieren sync manual

**Archivo**: `src/core/types.ts:81-82`

### M-2. `For` con `keyBy` y child que es fragment — feature claimed, not implemented

**Archivo**: `src/syntax/flow.ts:24-37`
- Comentario dice "Dev mode advierte al respecto" pero el `console.warn` no está.

### M-3. `Each` es alias sin valor agregado

**Archivo**: `src/syntax/flow.ts:80-89`

### M-4. `pattern()` no clona regex con flag `g` o `y`

**Archivo**: `src/features/forms.ts:219`

### M-5. `runSyncRules` retorna en el primer error sin documentar

**Archivo**: `src/features/forms.ts:79`

### M-6. `server.ts:corsHeaders` rechaza wildcard `*` pero el allowlist puede contenerlo

**Archivo**: `src/server.ts:127-129, 144-152`
- `normalizeAllowedOrigins` filtra `*`. El check `origin === '*'` es inalcanzable.

### M-7. `validateStaticDir` usa `statSync` (sync I/O)

**Archivo**: `src/server.ts:107-117`

### M-8. `isSameTopology` hace recursión completa sin memoización

**Archivo**: `src/app.ts:162-176`

### M-9. `composedTransform` cache hit es 0%

**Archivo**: `src/render/commit.ts:374-387`

### M-10. `getComputedStyle` no está en ningún test de edge cases

- Si `prepare.ts` lo añadiera, ningún test fallaría.

### M-11. `commitHydrate` lee DOM extensivamente sin documentación de la allowlist

**Archivo**: `src/render/commit.ts:96-103, 158, 185-186, 198, 219, 230, 233, 252, 269`

### M-12. `hot-path-dom-reads.test.ts` no cubre `src/app.ts`

**Archivo**: `tests/architecture/hot-path-dom-reads.test.ts:6-11`

### M-13. `engines-allocation-bounded.test.ts` permite 4 KB/call × 5000 = 20 MB de heap delta

**Archivo**: `tests/architecture/engines-allocation-bounded.test.ts:138`
- Threshold generoso enmascara leaks pequeños.

---

## 🟢 BAJOS

### L-1. `escapeStyleText` loop hasta estabilizar es O(n²) en el peor caso
**Archivo**: `src/ssr.ts:209-220`

### L-2. `commitHydrate` usa `Array.from(root.getElementsByTagName('*'))`
**Archivo**: `src/render/commit.ts:97` — O(n) lineal en DOM completo.

### L-3. `validateStaticDir` acepta symlinks
**Archivo**: `src/server.ts:107-117`

### L-4. `escapeHtml` no escapa backticks
**Archivo**: `src/ssr.ts:235-242`

### L-5. `installDevHook` se sobreescribe sin warn en re-mount
**Archivo**: `src/app.ts:79-104`

---

## 🎯 Cobertura del Demo (gap separado)

El demo actual (`demo/static.html` + `demo/app.ts` + showcases) muestra 14 de las 17
áreas públicas del API. **Faltan 3 áreas completas**:

### D-1. Router (`createRouter`, `defineAsyncComponent`) NO se muestra
- Exports estables desde v1.0.0 (`STABILITY.md:23-28`).
- Tests: `tests/router.test.ts` (17K).
- Implemented in `src/router.ts:265-321`.

### D-2. Context API (`createContext`, `withContext`, `useContext`, `createStore`,
`provideStore`, `injectStore`) NO se muestra
- Exports estables (`STABILITY.md:75-83`).
- Tests: `tests/context.test.ts`.
- Implemented in `src/features/context.ts`.

### D-3. Forms (`bind`, `validate`, `required`, `minLength`, `maxLength`, `pattern`)
NO se muestra
- Exports estables (`STABILITY.md:67-78`).
- Tests: `tests/forms.test.ts`.
- Implemented in `src/features/forms.ts`.

### D-4. Streaming SSR (`renderToReadableStream`) NO se muestra
- Export `@experimental` (`STABILITY.md:131-135`).
- Tests: `tests/ssr-stream.test.ts`.
- Implemented in `src/ssr-stream.ts`.

### D-5. `createServer` se usa internamente pero NO se documenta como demo
- El demo actual SÍ usa `createServer` (`demo/server.ts:91`) pero solo expone
  SSR clásico. No hay demo del server wrapper completo.

---

## 📋 Verificación del demo (baseline)

Antes de correcciones, baseline del demo:
- `bunx tsc --noEmit` → ✅ sin errores
- `bun run demo:build` → ✅ genera `demo/app.js` (71KB) + `demo/static-out/` (3 files)
- `bun test tests/architecture/` → ✅ 20 pass / 0 fail
- HTTP `GET /` → 200, 3291 bytes (launcher)
- HTTP `GET /static.html` → 200, 15752 bytes (demo estático)
- HTTP `GET /ssr?name=Test&width=720` → 200, 7175 bytes (SSR con 17 hydration markers)
- HTTP `GET /app.js` → 200, 71901 bytes

## 🚦 Plan de remediación

Ver `odd/tasks/axiom-hardening-plan.md` para el plan priorizado y criterios de cierre.
