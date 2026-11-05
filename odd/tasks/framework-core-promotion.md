# Feature: framework-core-promotion

Promote to `src/` every framework-shaped capability the demo hand-rolls today, remove it from `demo/`, and keep the Axiom philosophy intact — measurement and instrumentation stay out of the core.
Branch: `feat/framework-core-promotion` (from `docs/plan-demo`) · Delivery strategy: feature-branch-chain, local work-unit commits, no push/PR without explicit authorization · Test runner: `bun test` + `bun run typecheck`.

## Specs

- **S1** — "ahora basado en las mejoras que se hicieron al demo, verifique mejoras al framework."
  - Verificación cerrada antes de implementar: typecheck limpio y 885 tests en verde (0 fallos, 2 skips conocidos por `happy-dom`).
  - Alcance: `src/` (core) y `demo/` (retirada de lo que el core asuma).

- **S2** — "Todo lo que el demo esté haciendo a mano que debería hacer el framework hay que moverlo al framework y quitarlo del demo, OJO todos los cambios tienen que seguir la filosofía del framework y si son cosa de medición eso obviamente no va en el framework."
  - Criterio de admisión de cada candidato: (a) es trabajo del framework, no composición de aplicación; (b) no es medición.

- **S3** — La filosofía del framework es vinculante. Textos del repo:
  - "All calculations happen in memory. The hot path is pure arithmetic. Zero DOM reads." (`README.md`)
  - "❌ DOM reads  (getBoundingClientRect, offsetHeight, clientWidth)" / "❌ String operations" / "❌ Unnecessary allocations" / "❌ Canvas calls  (measureText)" / "❌ Anything that forces a browser layout reflow" (`README.md`)
  - "Zero-Allocation Hot Path": buffers `Float32Array` reciclados vía `src/render/pool.ts`, scratch de engines vía `src/render/engines/scratch.ts`, `nodeCount` como rango válido (`docs/ARCHITECTURE.md`).
  - Reglas de dependencia: `core/` → `reactivity/` → `render/` → `features/` → raíz (`docs/ARCHITECTURE.md`).
  - "`src/index.ts` is the **only** surface consumers should import from." (`docs/ARCHITECTURE.md`)
  - "Escape hatch: browser-level integration": `window.addEventListener`, `document.addEventListener` y `popstate` son legítimos para el router, widgets de terceros y paneles de demo, "clearly scoped" y "not the default interaction pattern" (`docs/ARCHITECTURE.md`).
  - Consecuencia: lo que necesite observación del DOM (`IntersectionObserver`, `getBoundingClientRect`) o `measureText` en el hot path **no entra al motor**; el core expone el dato y la app observa.

- **S4** — "si son cosa de medición eso obviamente no va en el framework."
  - Medición, instrumentación y atribución (contador de lecturas DOM, benchmarks, tiempos, paneles de inspección, T12/T13) se quedan fuera de `src/`. Permanecen en `demo/`, `benchmarks/` o `scripts/`.

- **S5** — "y quitarlo del demo."
  - Cada capacidad promovida se borra del `demo/` cuando el core la asume; no queda doble implementación.

- **S6** — Criterios de aceptación transversales.
  - `bun run typecheck` sin errores y `bun test` en verde, incluidos `tests/architecture/` (13 patrones de lectura DOM prohibidos, `charwidth-unified.test.ts`, `engines-allocation-bounded.test.ts`).
  - Toda capacidad promovida entra por `src/index.ts` si es superficie pública, y queda fijada por un test determinista.
  - Los commits son unidades de trabajo revisables (~400 líneas escritas) con tipo Conventional Commits; el versionado lo decide release-please al llegar a `main` (los commits `feat`/`fix` que tocan `src/` sí avanzan la versión: 1.0.1 → 1.1.0 al fusionar).

- **S7** — Texto: el contrato `TextLayoutEngine.layout()` ya existe (`src/render/prepare.ts:17-21`) y **nunca se invoca**: `measureTextChild` (`src/render/engines/text-measure.ts`) solo aplica la heurística `CHAR_WIDTH`/`WORD_WRAP_FACTOR`. El core debe **honrar el contrato**: invocar `layout(prepared, maxWidth, lineHeight)` y usar su `lineCount`/`height`; sin motor, la heurística actual sigue siendo el fallback.
  - Criterio: un motor de texto suministrado por el consumidor cambia la altura medida del nodo; sin motor, el comportamiento actual no cambia.
  - El fallback heurístico y sus constantes se quedan en `text-measure.ts` (`charwidth-unified.test.ts`).

- **S8** — Masonry: distribución en columna más corta, aritmética pura. Se expresa como `layout.display === 'masonry'` (`LayoutDisplay` gana `'masonry'`), reutilizando `gridTemplateColumns` para el número de columnas y `gap`/`columnGap`/`rowGap` para el espaciado.
  - El motor vive en `src/render/engines/masonry.ts` con la misma firma que `measureGrid`, y se despacha desde todos los puntos donde hoy se despacha `'grid'`: `src/render/reflow.ts:120`, `src/render/engines/flex.ts:154`, `src/render/engines/fast-path.ts:89`, `src/render/engines/grid.ts:379`.
  - `src/syntax/layout.ts` gana un helper `masonry(...)` siguiendo el patrón de `grid()`; se exporta desde `src/index.ts`.
  - Criterio: N columnas; el ancho de cada columna reparte el disponible menos los gaps; cada hijo va a la columna más corta; el alto del contenedor es el de la columna más alta; cero lecturas DOM; scratch por el pool de engines.
  - Los conjuntos de validación de `display` que el repo exige mantener en sincronía con los tipos (`src/core/types.ts`, nota "Validation sets") se actualizan junto con `LayoutDisplay`.

- **S9** — Router: helper de outlet genérico. Dado el `$route` reactivo (`src/router.ts:23`) y una tabla de rutas, resuelve la ruta activa, invoca el componente y le pasa props; sin coincidencia, el fallback. Sin observación del DOM: solo lectura de signals.
  - Se exporta junto a los exports del router en `src/index.ts`.
  - Criterio: la composición manual de `demo/router-demo.ts:201-211` desaparece y el comportamiento observable se mantiene.

- **S10** — Streaming SSR: hoy `renderToReadableStream` renderiza el documento entero y encola un chunk (`src/ssr-stream.ts:42-49`), y el demo re-emite ese resultado con buffer, split y temporizador (`demo/streaming-route.ts:142-180`). El core debe **serializar progresivamente**: la serialización escapada compartida vive en `src/ssr.ts`, `ssr-stream.ts` produce chunks sucesivos respetando cancelación y backpressure, y libera los buffers de layout.
  - El disclosure de "chunking artificial" del demo se retira **solo** cuando el comportamiento cambia de verdad.
  - Fuera de alcance (arquitectura L, decisión propia): SSR con fronteras asíncronas (`await` dentro del árbol). No se implementa aquí.

- **S11** — Servidor: política de caché configurable para las respuestas estáticas en `AxiomServerOptions`. Por defecto no cambia nada (comportamiento actual); el demo deja de fijar `no-store` a mano y usa la opción.

## Tasks

Ruta por defecto: inline para las unidades pequeñas; delegado (`gentle-ai-worker`) para las pesadas. Cada autor tiene superficie explícita y disjoint. Ningún autor toca `src/index.ts` salvo T9 (la superficie pública es del orquestador).

| ID | Tarea | Specs | Superficie autorizada | Ruta | Checks | Riesgo | Estado |
|---|---|---|---|---|---|---|---|
| T1 | Clasificar cada construcción local del `demo/` con los filtros (a)/(b) | S2, S3, S4 | — | explorar | — | none | hecho |
| T2 | `provideStore<T,R>` devuelve `R` como `withContext` | S5, S6 | `src/features/context.ts`, `tests/context.test.ts`, `tests/types/context.test-d.ts`, `demo/context-demo.ts` | inline | `bun test tests/context.test.ts` + typecheck | 3 | pendiente |
| T3 | Honrar `TextLayoutEngine.layout()` en la medición | S7 | `src/render/prepare.ts`, `src/render/engines/text-measure.ts`, `tests/reflow.test.ts`, `tests/text-engine.test.ts` (nuevo) | delegado | `bun test tests/text-engine.test.ts tests/reflow.test.ts` | 3 | pendiente |
| T4 | Motor masonry + despacho + helper de sintaxis | S8 | `src/render/engines/masonry.ts` (nuevo), `src/render/reflow.ts`, `src/render/engines/{flex,fast-path,grid}.ts`, `src/syntax/layout.ts`, `src/core/types.ts`, `tests/masonry.test.ts` (nuevo) | delegado | `bun test tests/masonry.test.ts` | 3 | pendiente |
| T5 | Outlet genérico de router | S9 | `src/router.ts`, `tests/router-outlet.test.ts` (nuevo) | delegado | `bun test tests/router-outlet.test.ts` | 3 | pendiente |
| T6 | Serialización en streaming real | S10 | `src/ssr.ts`, `src/ssr-stream.ts`, `tests/ssr-stream.test.ts` | delegado | `bun test tests/ssr-stream.test.ts` | 2, 3, 4 | pendiente |
| T7 | Política de caché estática configurable | S11 | `src/server.ts`, `tests/server.test.ts` | inline | `bun test tests/server.test.ts` | 3, 5 | pendiente |
| T8 | Retirar del `demo/` lo que el core asume (incluye duplicados ya soportados) | S5 | `demo/**`, `tests/demo-*.test.ts`, `tests/wire-showcase*.test.ts` | inline | `bun test tests/` | 3, 6 | pendiente |
| T9 | Superficie pública y documentación | S6 | `src/index.ts`, `README.md`, `docs/` | inline | `bun run typecheck`, `bun run validate:api` | 3 | pendiente |
| T10 | Verificación final | S6 | — | inline | typecheck + suite completa + `tests/architecture/` + `bun run demo:build` + navegador (CDP) + `validate:api` + `validate:release-notes` | 5 | pendiente |

### Orden

```text
Wave 1 (paralelo):  T3 · T4 · T5 · T6        T2 · T7 (inline)
Wave 2 (secuencial): T8 (depende de T3/T5/T6/T7)
Wave 3:             T9 → T10
```

## Log

- **L1** (2026-11-04, petición original): "ahora basado en las mejoras que se hicieron al demo, verifique mejoras al framework."
- **L2** (2026-11-04, verificación): baseline sano — `bun run typecheck` exit 0; `bun test` 885 pass / 0 fail / 2 skip / 9222 expect() en 54 archivos. El mapeo demo→core quedó trazado: la mayoría de las mejoras del demo no son trabajo del framework (composición de aplicación), y seis sí lo son.
- **L3** (2026-11-04, decisión de alcance del mantenedor, textual): "Todo lo que el demo esté haciendo a mano que debería hacer el framework hay que moverlo al framework y quitarlo del demo, OJO todos los cambios tienen que seguir la filosofía del framework y si son cosa de medición eso obviamente no va en el framework."
- **L4** (2026-11-04, hallazgo previo): `git show 1bb4c45 --stat` demuestra que los cinco defectos que el usuario encontró en el navegador se corrigieron solo en `demo/` + este ODD — el core no tenía ese defecto. Premisa obsoleta a corregir: el diagnóstico B6 de `odd/tasks/demo-ui-polish.md` ("atributos reactivos no soportados") ya no aplica (`src/render/diff.ts:152`, `src/render/commit.ts:443`).
- **L5** (2026-11-04, clasificación T1): promovidos = texto (S7), masonry (S8), outlet de router (S9), streaming real (S10), caché estática (S11), proveedor transparente (T2) y tres duplicados ya soportados por el core (`wireShowcase` = `effect(update)`, `cancelTransition`, `metadata.inlineStyles`). No promovidos = medición (contador DOM, benchmarks, perfiles, T12/T13) y composición de aplicación (scrollspy con `IntersectionObserver`, vistas, paletas, umbrales, canvas, modal, rutas).
- **L6** (2026-11-04, evidencia de contratos): `TextLayoutEngine.layout()` ya está declarado en `src/render/prepare.ts:17-21` pero `measureTextChild` (`src/render/engines/text-measure.ts`) nunca lo invoca → el core acepta un motor de texto y lo ignora. El despacho de engines es por `layout.display` (`src/render/reflow.ts:120`), y `LayoutDisplay` es `'flex' | 'grid'` (`src/core/types.ts:108`). `src/index.ts` es la única superficie pública.
- **L7** (2026-11-04, RDD): `gentle-ai review mode status` → "receipt-driven development: on (decided by global)". Cada commit de unidad se somete a `gentle_review {"operation":"assess"}`; si el tier lo exige, se abre revisión nativa sobre ese commit.
