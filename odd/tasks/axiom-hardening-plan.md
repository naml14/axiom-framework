# Feature: axiom-hardening — Plan de Remediación

> **Origen**: `odd/tasks/axiom-hardening.md` (38 hallazgos: 7 críticos, 13 altos, 13 medios, 5 bajos).
> **Fecha**: 2026-01-09
> **Estrategia**: 4 fases ordenadas por riesgo/impacto. Cada fase tiene criterios de cierre
> verificables. Las fases pueden solaparse en PRs separados si se desea, pero el orden
> secuencial minimiza conflictos.

---

## Resumen ejecutivo

| Fase | Alcance | Hallazgos | Esfuerzo | Riesgo |
|---|---|---|---|---|
| **Fase 0** (ahora) | Correcciones del demo para cobertura completa | D-1 a D-5 | M | Bajo |
| **Fase 1** | Seguridad XSS + memory leak + docs drift | C-1, C-2, C-3, C-5, C-6, C-7, H-11 | M | Bajo |
| **Fase 2** | Hot-path performance (strings/arrays allocations) | H-1 a H-8 | M-L | Medio |
| **Fase 3** | Enforcement + drift cleanup | C-4, H-9, H-10, M-1, M-2, M-10, M-12, M-13, M-11, L-1 a L-5 | S-M | Bajo |

**Criterio global de cierre**:
- `bunx tsc --noEmit` → 0 errores
- `bun test` → todos los tests pasan (incluyendo nuevos tests)
- `bun run demo:build` → genera bundle sin errores
- `bun run demo` arranca y todas las secciones del demo son interactivas
- `bun run validate:api` → 0 errores

---

## ✅ Estado de ejecución (2026-09-22)

**Rama**: `integration/hardening-good-rollup` — base `d964d36` (`origin/main`), un merge por
desarrollo. Reemplaza a `integration/hardening-phase-0-1-2`, que fue eliminada.

| Fase | Ítems | Estado |
|---|---|---|
| **Fase 0** | F0-T1 … F0-T6 | ✅ entregada (demos de router, context, forms, streaming SSR y launcher) |
| **Fase 1** | F1-T1 … F1-T7 | ✅ entregada, con las salvedades 1 y 2 de abajo |
| **Fase 2** | F2-T1 … F2-T6, F2-T8 | ✅ entregada |
| **Fase 2** | **F2-T7** (H-7) | ❌ **excluida por defecto reproducido**: la implementación congelaba el demo |
| **Fase 3** | F3-T1 … F3-T9 | ⬜ no iniciada |

**Criterio global de cierre, medido en la rama**:

- `bun run typecheck` → 0 errores
- `bun test` → 726 pasan / 2 saltan / 0 fallan (37 archivos)
- `bun run demo:build` → sin errores
- `bun run demo` + navegador real (Playwright, 3 corridas independientes) → 9/9 invariantes
  estructurales, 19/19 acciones sin fallo (navegación + 2 capturas + 2 sliders + portal
  abrir/cerrar + 12 botones), sin cuelgue, 0 errores de página (el único 404 es
  `/favicon.ico`, preexistente y también presente en `main`)
- `bun run validate:api` → 0 errores (137 exports: 132 stable, 5 experimental, 0 deprecated)
- `GET /`, `/static.html`, `/ssr`, `/ssr-stream` → 200; las dos rutas SSR renderizan contenido real

**Salvedades que un cierre de fase no debe pasar por alto**:

1. **C-1 quedó parcial.** `attrs.ts` permite `data:image|audio|video` (SVG solo en base64) y
   bloquea el resto de `data:`. Pero `escapeStyleText()` en `src/ssr.ts` sigue eliminando
   `url(...)` completo, así que una imagen base64 legítima dentro de un estilo inline SSR se
   descarta. Documentado en `SECURITY.md`.
2. **F1-T7 logró la etiqueta pero no el efecto buscado en el validador.**
   `resetIndexCounter` está marcado `@deprecated` en `src/render/prepare.ts`, pero
   `src/index.ts` usa exports explícitos y no lo re-exporta, y `validate-api-stability.ts`
   solo escanea `src/index.ts` y `src/testing.ts`. El reporte seguirá mostrando
   `Deprecated: 0`. Decisión pendiente: re-exportarlo para que entre en el contrato,
   eliminarlo (es no-op) o aceptar la etiqueta como documentación sin efecto en el validador.
3. **Fase 3 no se tocó**: C-4, H-9, H-10, M-1, M-2, M-10 a M-13 y L-1 a L-5 siguen abiertos.
4. **`CHANGELOG.md` no se edita a mano**: lo genera release-please a partir de los mensajes
   convencionales de los merges; el archivo solo tiene el marcador de inserción, sin sección
   *Unreleased*.
5. **El rollup descartado fue purgado.** `integration/hardening-phase-0-1-2` y el commit
   roto `a3ffe0f` ya no existen en el repositorio (bundle de recuperación y `refs/recovery/*`
   eliminados) después de verificar que los 15 tips sanos son ancestros de esta rama. Se
   preservó su `PR_DESCRIPTION.md` como material para la descripción del PR nuevo. Lo único
   que dejó de ser recuperable es el objeto del commit roto y el historial de merges del
   rollup viejo; el defecto queda documentado en F2-T7 y el orden de integración es
   autoexplicativo en los 15 merge commits de esta rama.

---

## FASE 0 — Cobertura del demo (PRIORIDAD INMEDIATA)

> **Por qué primero**: el demo es la superficie de demostración pública del proyecto.
> Las features públicas no mostradas son "invisibles" para usuarios y revisores.
> Esta fase es la más visible y de bajo riesgo (no toca el core del framework).

### F0-T1: Demo Router (D-1)
**Acción**: Crear `demo/router-demo.ts` con `initRouterDemo()`.
- 3 rutas estáticas: `/`, `/about`, `/users/:id`
- 1 ruta dinámica con `defineAsyncComponent` (loader simulado con `setTimeout`)
- Navegación con `router.push('/users/42')`, `router.replace(...)`, `router.go(-1)`
- Mostrar `$route.value` en vivo (path, params, query, hash)
- Controles externos (escape hatch): `addEventListener` en botones estáticos

**Criterio de cierre**:
- `demo/router-demo.ts` exporta `initRouterDemo()`
- `demo/app.ts` invoca `initRouterDemo()`
- `demo/static.html` añade `<section>` con `id="router-demo-root"` y botones
- Verificación manual: navegar entre rutas actualiza `$route` y re-monta componente

### F0-T2: Demo Context API (D-2)
**Acción**: Crear `demo/context-demo.ts` con `initContextDemo()`.
- `createContext` para theme (light/dark)
- `createStore` para counter compartido
- `withContext` en el provider
- `useContext` en el consumer (deeply nested)
- `provideStore` + `injectStore` para un store global

**Criterio de cierre**:
- `demo/context-demo.ts` exporta `initContextDemo()`
- Cambio de theme afecta consumer nested
- Counter compartido entre dos consumers demuestra `provideStore`/`injectStore`

### F0-T3: Demo Forms (D-3)
**Acción**: Crear `demo/forms-demo.ts` con `initFormsDemo()`.
- `bind(input, signal)` para two-way binding
- `validate(signal, [required, minLength(8)], { debounceMs: 300 })` con sync + async rules
- Mostrar `ValidationResult` (valid, errors, pending) en vivo
- Async rule simulado: `async (v) => Promise<…>` con delay

**Criterio de cierre**:
- Input refleja signal y signal refleja input (two-way)
- Validación sincrona se muestra inmediato
- Validación async muestra pending → resolved

### F0-T4: Demo Streaming SSR (D-4)
**Acción**: Extender `demo/server.ts` con ruta `/ssr-stream`.
- Handler que usa `renderToReadableStream` para streaming chunks
- Demo page que demuestra progressive rendering (chunks llegan progresivamente)

**Criterio de cierre**:
- `GET /ssr-stream` → 200, content-type `text/html`, body streamed
- Cliente puede ver chunks llegando (script JS que mide tiempo entre chunks)

### F0-T5: Demo `createServer` como wrapper completo (D-5)
**Acción**: Documentar y demostrar `createServer` en el launcher.
- Añadir sección en `demo/index.html` que explica las 4 capabilities:
  routing SSR + static files + per-route metadata + CORS + rate limiting.
- Link desde `static.html` al `index.html` (launcher).

**Criterio de cierre**:
- `demo/static.html` incluye link visible al launcher
- Launcher describe `createServer` features

### F0-T6: Verificación end-to-end
**Acción**: Levantar el demo server, hacer curl + checks de cada sección.
- `bun run demo` levanta el server
- curl todas las rutas (launcher, static.html, ssr, ssr-stream, /app.js, /style.css)
- Verificar que las nuevas secciones tienen contenido (no quedan vacías)

**Criterio de cierre**:
- Todas las rutas devuelven 200
- Las nuevas secciones renderizan correctamente

---

## FASE 1 — Seguridad y correctness

### F1-T1: Permitir `data:` URLs legítimas (C-1)
**Archivos**: `src/core/attrs.ts:46-52, 130-145`, `src/ssr.ts:222`
**Acción**:
1. En `sanitizeUrlValue`, separar la lógica:
   - Bloquear siempre: `javascript:`, `vbscript:`, `file:`, `data:text/html`, `data:application/javascript`
   - Permitir: `data:image/*`, `data:audio/*`, `data:video/*`, `data:application/pdf`
2. En `escapeStyleText`, permitir `url(data:image/…)` explícitamente
3. Tests:
   - `tests/edge-cases.test.ts`: añadir tests para `data:image/png;base64,...` permitido
   - `tests/ssr.test.ts`: añadir test para `<img src="data:image/png;base64,...">` permitido

**Riesgo**: si el regex se rompe, regresión de seguridad XSS.
**Mitigación**: tests cubren AMBOS lados (allow + deny), whitelist explícita.

### F1-T2: Eliminar `for...in` en syntax layer (C-2)
**Archivos**: `src/syntax/h.ts:189, 271`
**Acción**:
1. Cambiar a `Object.keys(source)` + iteración indexada
2. Tests: añadir test que intente pasar `{ __proto__: { 'aria-hidden': 'evil' } }`
   y verificar que NO se aplica.

**Riesgo**: bajo, son rewrites directos.

### F1-T3: Aislar `pruneTimer` y `requestCounts` en scope de instancia (C-3)
**Archivos**: `src/server.ts:155-170`
**Acción**:
1. Mover `pruneTimer` y `requestCounts` dentro de `createServer()`
2. `stop()` ya limpia el timer; verificar que el Map también se limpia (set to `new Map()`)
3. Tests: añadir test que cree 2 servers independientes y verifique counters aislados

**Riesgo**: bajo, es refactor de scope.

### F1-T4: Actualizar doc de `cssManaged` (C-5)
**Archivos**: `src/features/portal.ts:22-32`
**Acción**: Reescribir el comentario. Reemplazar "Future: not yet implemented" por
descripción correcta del flag implementado con ejemplo de uso.

**Riesgo**: ninguno, solo docs.

### F1-T5: Optimizar `sanitizeAttrs` allocation (C-6)
**Archivos**: `src/core/attrs.ts:189-220`
**Acción**:
1. Pre-allocate solo si `hasChanges` se va a setear (lazy)
2. O usar mutación in-place sobre copia del input
3. Test de regresión: comportamiento idéntico

### F1-T6: Inyectar scheduler configurable a `validate()` (C-7)
**Archivos**: `src/features/forms.ts:177`
**Acción**:
1. `validate(...)` acepta opciones nuevas `{ scheduler?: SchedulerFn }`
2. Si se pasa, usa `scheduler(() => …)` en lugar de `setTimeout(…, debounceMs)`
3. Default sigue siendo `setTimeout` (backward compatible)
4. Doc y test de integración con `createApp({ scheduler })`.

### F1-T7: Marcar `resetIndexCounter` como `@deprecated` (H-11)
**Archivos**: `src/render/prepare.ts:36-43`
**Acción**: Añadir `@deprecated Since v1.0.0 — no-op. Counter isolation is now per-invocation.`
para que `bun run validate:api` lo capture como deprecation.

---

## FASE 2 — Hot-path performance

> **Por qué no primero**: estos son micro-optimizaciones. Si Fase 1 rompe algo, Fase 2
> tendría que rebasearse. Además, el enforcement test (Fase 3) puede ayudar a
> guiar cuáles optimizaciones realmente valen la pena medir.

### F2-T1: Cache de `composedTransform` por par `(x,y)` (H-1)
**Archivos**: `src/render/commit.ts:374-387, 726`
**Acción**:
- Agregar `Map<number, string>` o tabla `WeakMap<number, string>` en `applyFrameworkLayout`
- Key: hash de `(x << 16) | (y & 0xFFFF)` (Float32 to Int32)
- LRU bounded (max 256 entries)
- Test de regresión: `transform` resultante idéntico

### F2-T2: Eliminar `.map(c => brandPrepared(c))` en getters de children (H-2)
**Archivos**: `src/render/prepare.ts:303-306, 336-339`
**Acción**:
- Cambiar `getPreparedChildren` para retornar directamente el array interno
- El "branding" se mantiene vía types
- Tests: verificar que `===` comparison funciona entre lecturas consecutivas

### F2-T3: Reducir allocations en `fullDiff` (H-3)
**Archivos**: `src/render/diff.ts:90, 207, 209, 320, 325, 511, 522`
**Acción**:
- Pool los Maps/Sets (4 entradas) en `scratch.ts` o nuevo `diff-scratch.ts`
- Reusar entre ciclos cuando el path es "value change only"
- Tests: el path "same nodeCount" debe usar el pool

### F2-T4: Pool de strings para `buildCellKey` (H-4)
**Archivos**: `src/render/engines/grid.ts:340`
**Acción**:
- Cambiar `buildCellKey` para usar una cache estática (e.g. `Map<string, string>`)
- O usar índice numérico packed (e.g. `row * 1000 + col` como Int32 key en lugar de string)
- El `occupiedCells` Set ya puede usar números directamente.

### F2-T5: Pool de `buildRowOffsets` array (H-5)
**Archivos**: `src/render/engines/grid.ts:438-447`
**Acción**:
- Reusar el array del scratch pool o pasar uno como out-param

### F2-T6: Eliminar `filter` allocation en fast-path (H-6)
**Archivos**: `src/render/engines/fast-path.ts:33`
**Acción**:
- Iterar dos veces (una para contar, otra para layout) o usar índice simple sin array

### F2-T7: Reducir allocations en `notifySubscribers` (H-7) — ❌ EXCLUIDA, NO REPETIR COMO ESTABA

**Estado**: se implementó como `perf(signals): iterate _subs directly when size <= 8`
(`a3ffe0f`), se midió y quedó **excluida** de `integration/hardening-good-rollup`.
**Archivos**: `src/reactivity/signals.ts:100, 184`

**Por qué se excluyó — defecto reproducido**: la implementación iteraba el `Set` vivo
cuando `subs.size <= 8`, con el argumento de que el snapshot solo hace falta si se borra
el elemento actual durante la iteración. El argumento es falso: un iterador de `Set`
**también visita los elementos agregados durante la iteración**. Un efecto que se
suscribe al mismo nodo mientras está siendo notificado agrega un elemento que el bucle
vuelve a ejecutar, y así indefinidamente: el hilo principal del navegador queda bloqueado
para siempre. Síntoma observado: el demo carga y renderiza una vez, y se congela en el
primer re-render (mover el slider «Items» de 20 a 40); el renderer termina muriendo.

**Evidencia medida**:
- `main` + **solo** esa rama → se congela.
- El rollup sin esa rama → sano (9/9 invariantes, 19/19 interacciones).
- El rollup con la línea revertida a la instantánea → sano otra vez.
- `bun test` sobre el rollup roto **no termina** (agotó un tope de 150 s) mientras que en
  la rama buena termina en ~5 s: la batería sí detecta el defecto, se cuelga.

**Acción correcta si se reintenta**:
- Iterar SIEMPRE una instantánea: `const subs = [...node._subs]`. Un iterador de `Set` no
  es seguro frente a altas durante la iteración; la copia es el precio de la semántica.
- El ahorro real no está en evitar la copia. Medir primero (`tracker` en
  `evaluateComputed` y el resto del hot path) y optimizar solo con evidencia.
- Añadir test de regresión: un efecto que se suscribe al mismo nodo durante `notify` debe
  terminar de forma acotada. Hoy `bun test` solo lo detecta colgándose.

### F2-T8: Eliminar `Object.entries` allocations (H-8)
**Archivos**: `src/features/style.ts:187-194`, `src/render/commit.ts:608, 661, 696, 726`
**Acción**:
- Usar `for (const key in Object.keys(obj))` con cache de keys, o `Reflect.ownKeys`
- O iterar por `Object.prototype.hasOwnProperty.call` con key array pre-allocated

---

## FASE 3 — Enforcement y cleanup

### F3-T1: Extender `hot-path-dom-reads.test.ts` para incluir `src/app.ts` (C-4, M-12)
**Archivos**: `tests/architecture/hot-path-dom-reads.test.ts`
**Acción**:
- Añadir `src/app.ts` al scan (o documentar la excepción)
- Si se escanea: hay 4 violaciones (`window.innerWidth`, `window.innerHeight`,
  `root.clientWidth`, `root.clientHeight`).
- Decidir: ¿remediar (eliminar DOM reads del update cycle) o allowlist explícito?
- **Recomendación**: allowlist explícito con comentario inline que justifique
  "one-time per cycle, not per-frame in steady state". El test debe entonces
  verificar que esos reads no se llaman dentro de un frame.

### F3-T2: Llamar `validateStyleProps` en `applyStyleToElement` (H-9)
**Archivos**: `src/features/style.ts:187-194`, `src/render/commit.ts:726`
**Acción**:
- En producción: assume pre-validated (no-op overhead)
- En dev: `validateStyleProps(props)` antes de aplicar
- Test: intentar aplicar `{ evilProp: 'evil' }` y verificar que se ignora

### F3-T3: Marcar `axiom-premise-guard.md` como completado (H-10)
**Archivos**: `odd/tasks/axiom-premise-guard.md`, `odd/tasks/`
**Acción**:
- Mover a `odd/tasks/archive/` o añadir banner "Estado al 2026-09-16: T1-T4 aplicados"
- Si quedan tareas abiertas, mover a `axiom-hardening.md`

### F3-T4: Derivar types de unions para evitar drift (M-1)
**Archivos**: `src/core/types.ts:81-82`
**Acción**:
- Convertir `VALID_JUSTIFY_VALUES` a tipo derivado (TS 4.1+):
  `const VALID_JUSTIFY_VALUES = ['start', 'center', ...] as const satisfies readonly JustifyContent[]`
- Aplicar también a `VALID_ALIGN_VALUES`
- Añadir `VALID_FLEX_WRAP_VALUES` para el union que falta

### F3-T5: Implementar warning de `keyBy` con fragment (M-2)
**Archivos**: `src/syntax/flow.ts:24-37`
**Acción**:
- Añadir `console.warn` (en dev) cuando `keyBy` + fragment child
- Mensaje claro: "keyBy has no effect on fragment children; use keyBy on the For itself"

### F3-T6: Tests de edge cases faltantes (M-4, M-5, M-10)
**Archivos**: `tests/forms.test.ts`, `tests/edge-cases.test.ts`
**Acción**:
- `pattern()` con regex `/foo/g`: test que `regex.test()` se llama múltiples veces
  sin estado corrupto
- `runSyncRules` fail-fast: test que verifica que solo se reporta el primer error
- Tests que `getComputedStyle`, `getBoundingClientRect`, etc. NO se usan en
  ningún archivo del framework (scan más amplio)

### F3-T7: Documentar allowlist DOM reads de `commitHydrate` (M-11)
**Archivos**: `src/render/commit.ts:96-103, 158, 185-186, 198, 219, 230, 233, 252, 269`
**Acción**:
- Añadir bloque JSDoc al inicio de `commitHydrate` listando todos los DOM reads
  permitidos y la justificación (one-time hydration only)
- Actualizar `tests/architecture/hot-path-dom-reads.test.ts` para que el escaneo
  skip `commitHydrate` específicamente (línea de demarcación clara)

### F3-T8: Reducir threshold del heap delta test (M-13)
**Archivos**: `tests/architecture/engines-allocation-bounded.test.ts:138`
**Acción**:
- Cambiar `4 * 1024` (4 KB) por `256` (256 bytes/call)
- Documentar el rationale: detectar leaks pequeños (1-10 byte/call × 5000)
- Verificar que pasa con código actual (baseline -15 MB indica holgura)

### F3-T9: Limpieza de items bajos (L-1 a L-5)
- L-1: `escapeStyleText` — bounded loop con max iterations
- L-2: `commitHydrate` — iterar solo subtree de root
- L-3: `validateStaticDir` — rechazar symlinks
- L-4: `escapeHtml` — añadir backtick
- L-5: `installDevHook` — warn si ya existe

---

## 📦 Entregables esperados

Por fase:
- **Fase 0**: PR con 4 nuevos demos (Router, Context, Forms, Streaming SSR) + docs
- **Fase 1**: PR con 7 fixes de seguridad/correctness + 6 tests nuevos
- **Fase 2**: PR con 8 optimizaciones de hot path + benchmarks before/after
- **Fase 3**: PR con 9 enforcement/cleanup items + threshold adjustments

## 📊 Métricas esperadas post-Fase 2

- `prepare()` per component: < 2ms (target era < 5ms)
- `reflow()` per component: < 0.3ms (target era < 0.5ms)
- Heap delta per reflow: < 100 bytes (era < 4KB, será 40× menor)
- DOM reads in `app.ts` `getConstraints()`: 4 (acknowledged en F3-T1)

## 🚦 Riesgos globales

- **Cambios en Fase 2** pueden requerir re-tuning del `engines-allocation-bounded.test.ts`
  si las optimizaciones cambian el patrón de allocations (puede subir el delta inicial
  mientras se estabiliza el pool, luego bajar).
- **Fase 1 F1-T1** (data URLs) es el cambio de seguridad más delicado. Si el whitelist
  es muy permisivo, abre XSS. Si es muy restrictivo, rompe imágenes inline.

## 📅 Orden de ejecución recomendado

1. **Fase 0** completa (1 sprint) → demo demuestra TODAS las features
2. **Fase 1** F1-T1, F1-T2 (1 sprint) → cierra los 2 security holes más urgentes
3. **Fase 3** F3-T1 (1 sprint) → enforcement previene regresión
4. **Fase 2** completa (1-2 sprints) → perf
5. **Fase 1** resto + **Fase 3** resto (1 sprint) → cleanup final
