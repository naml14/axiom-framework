# Backlog de pendientes — renovación 2026-10-16

Este documento es la **lista única vigente** de pendientes del proyecto. Los documentos fuente
(`axiom-hardening-plan.md`, `axiom-hardening.md`, `hardening-docs-sync.md`,
`npm-oidc-trusted-publishing.md`, `release-0.9.14-verification.md`) conservan el detalle
histórico y la evidencia; aquí solo vive el estado corriente: qué está abierto, con qué origen y
cuál es su siguiente acción concreta.

## Cerrados en esta renovación (no reabrir sin evidencia nueva)

- **Release 0.9.14 fantasma (PR #118).** Cerrado sin mergear (opción A del mantenedor), rama
  remota de release-please eliminada, evidencia y scripts commiteados (`ce02063`, `c08dc02`).
  Motivo: árbol idéntico a v0.9.13 y CHANGELOG con dos Features revertidas por #117.
- **U1 (npm OIDC trusted publisher).** Confirmado funcionando: 0.9.13 publicado vía OIDC el
  2026-09-23T20:49Z, ~2 min después del release de GitHub.
- **Limpieza de ramas.** 4 remotas ya mergeadas y 3 locales fusionadas borradas; rama
  `chore/revert-create-aviom-merges` eliminada y repositorio en `main` al día.
- **demo-ui-polish T1-T6**, **hardening-docs-sync T1-T4**, **npm-oidc T1-T4**: entregados.
- **Hardening Fases 0, 1 y 2**: entregadas (F2-T7 excluida, ver P2).

## P0 — Afectan a la próxima release

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| R1 | El próximo release PR de release-please volverá a traer las 2 Features fantasma del revert | `release-0.9.14-verification.md` §6, L5 | Al abrirse el PR: editar `CHANGELOG.md` en su rama (quitar las entradas o nota del revert) y aprobar sus runs antes de mergear |
| R2 | Corridas de CI/Security en ramas de release-please que fallan **sin jobs** (`73ecf14`, `21abff7`) | verificación 2026-10-16 (runs 35946642479, 38952332592) | La próxima vez: leer el log de arranque del workflow en la UI de Actions (falla antes de crear jobs) |
| R3 | `create-axiom` termina con exit 0 e imprime «Ready!» aunque `bun install` falle | issue #96; reproducido en head de release | Fix del exit code + test que lo pine, dentro del alcance de #96 |

## P1 — Seguridad y correctness (Fase 3 del hardening, sin iniciar)

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| F3-T1 | C-4 + M-12: `src/app.ts:getConstraints()` hace 4 DOM reads por update cycle y el enforcement test no escanea `src/app.ts` | plan FASE 3 | Decidir allowlist explícito justificado vs remediar; extender `hot-path-dom-reads.test.ts` |
| F3-T2 | H-9: `validateStyleProps` nunca se llama; el whitelist se rompe en runtime | plan FASE 3 | Llamarlo en dev en `applyStyleToElement` + test con prop maliciosa |
| F3-T7 | M-11: `commitHydrate` lee DOM extensivamente sin allowlist documentada | plan FASE 3 | JSDoc con la allowlist y demarcación en el test |
| F3-T9a | L-3: `validateStaticDir` acepta symlinks | plan FASE 3 | Rechazar symlinks + test |
| F3-T9b | L-4: `escapeHtml` no escapa backticks | plan FASE 3 | Añadir backtick al escape + test |
| S1 | C-1 parcial: `escapeStyleText` descarta `url(...)` con `data:image` base64 legítima en estilos inline SSR | docs-sync T7; `SECURITY.md` | Decidir: soportar `url(data:…)` saneado en SSR o documentar la asimetría como política |
| S2 | H-11 / F1-T7: `resetIndexCounter` marcado `@deprecated` pero no re-exportado; el validador seguirá en `Deprecated: 0` | docs-sync T6 | Decidir: re-exportar, eliminar (es no-op) o aceptar la etiqueta como documentación |

## P2 — Correctness y contratos

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| F2-T7 | H-7 excluida: la optimización de `notifySubscribers` congelaba el demo | plan, salvedad 2 | Reabrir solo después de T5 (comentario de invariante en `signals.ts` + test que convierta el cuelgue en fallo rápido) |
| T5 | Comentario de invariante en `src/reactivity/signals.ts` + test de regresión del cuelgue | docs-sync T5 | Implementar junto con T8 en un commit re-verificado |
| T8 | Cabecera de `src/render/diff-scratch.ts` dice «3 Maps y 2 Sets» pero hay 5 Maps y 4 Sets | docs-sync T8 | Corregir el comentario junto con T5 |
| F3-T3 | H-10: `axiom-premise-guard.md` desactualizado | plan FASE 3 | Archivar o poner banner de estado; mover tareas abiertas a `axiom-hardening.md` |
| F3-T4 | M-1: unions de `VALID_JUSTIFY_VALUES`/`VALID_ALIGN_VALUES` con sync manual; falta `VALID_FLEX_WRAP_VALUES` | plan FASE 3 | Derivar types con `as const satisfies` + test de drift |
| F3-T5 | M-2: `keyBy` con child fragment no avisa (feature claimed, not implemented) | plan FASE 3 | `console.warn` en dev + test |
| F3-T6 | M-4, M-5, M-10: edge cases sin test (regex con flag `g`/`y`, fail-fast de `runSyncRules`, scan amplio de `getComputedStyle`/`getBoundingClientRect`) | plan FASE 3 | Añadir los 3 tests |
| F3-T8 | M-13: threshold del heap delta en 4 KB/call enmascara leaks pequeños | plan FASE 3 | Bajar a 256 B/call y verificar baseline |
| K1 | H-12: `portal.ts` no maneja portals con target desconectado en CSR | catálogo, sin fase asignada | Verificar estado actual; si sigue abierto, asignar tarea con test |
| K2 | H-13: `applyOps`/`commitFull` no verifican `parentNode` antes de `appendChild` | catálogo, sin fase asignada | Idem |
| K3 | M-3, M-6, M-7, M-8, M-9 sin tarea en el plan | catálogo | Revisar uno a uno: resueltos en Fases 1-2, aceptados como wont-fix, o crear tarea |
| F3-T9c | L-1 (`escapeStyleText` O(n²)), L-2 (`commitHydrate` itera el DOM completo), L-5 (`installDevHook` sin warn en re-mount) | plan FASE 3 | Bounded loop, iterar solo subtree, warn; con tests |

## P3 — Demo y DX (hallazgos de la verificación 2026-10-16, preexistentes en 0.9.13)

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| D1 | Tarjetas Syntax recortadas 10 px: `.syntax-panel > div:last-child { padding:10px }` da padding CSS al host de árboles Axiom | `release-0.9.14-verification.md` §5.1, `shots/zoom-syntax-h-v2.png` | Mover el padding al layout del motor (regla de `demo-ui-polish.md`) |
| D2 | `.grid-demo-canvas` con `height: 160` y contenido de 196 px: 4 celdas absolutas fuera del root | §5.2, `shots/zoom-grid-mvp.png` | Ajustar height/filas del canvas en `ruta-b-showcase.ts` |
| D3 | `h2.hero-title` de 26 px en filas de 20 px (router 404 y sección Portal) | §5.3 | Ajustar altura de fila o tipografía |
| D4 | 14 px de overflow horizontal a 390 px por el canvas fijo de 800 px | §5.4, `shots/06-static-390.png` | Decidir: soporte móvil del demo o documentarlo como desktop-only |
| D5 | 2 tests de `bind` con `select` saltados (limitación de happy-dom) | suite | Decidir runner alternativo o mock y reactivar los tests |
| D6 | Cobertura floja: `h.dev.ts` 66.7 % líneas / 46.3 % ramas, `server.ts` 87.5 %, `ssr.ts` 91.7 % | coverage gate | Añadir tests de los caminos faltantes |

## P4 — Entrega, repo y programa v1.0

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| U2 | Revocar el token npm de larga duración y eliminar `secrets.NPM_TOKEN` tras un publish OIDC exitoso | npm-oidc U2 | Ejecutar después del próximo publish automatizado |
| U3 | Marcar Publishing access con 2FA requerida y sin tokens | npm-oidc U3 | Configurar en npmjs.com |
| G1 | Issue #96 abierto: endurecer el CLI (flags, directory guard, exit code de install, static build); su implementación fue revertida | GitHub | Re-planificar con los aprendizajes del revert (incluye R3) |
| G2 | Issue #30 abierto: EPIC Axiom v1.0.0 Readiness (Go/No-Go) | GitHub | Revisar criterios y estado para el go/no-go |
| G3 | Higiene local: `.verify-tmp/` (scratch de verificación), `clean-test/` (32 MB) y `gh-run-latest-test.log` | estado del repo | Borrar los tres; decidir si se commitean los `.atl/skill-registry.*` modificados |
| G4 | 20 ramas remotas y 18 locales sin fusionar (varias pares revertidos de create-axiom) | estado del repo | Revisar cada una: podar, re-planificar o archivar con nota |

## Convención de mantenimiento

- Cada pendiente vive aquí con ID, origen y siguiente acción; el detalle y la evidencia quedan en
  el documento fuente enlazado.
- Al cerrar un ítem: moverlo a «Cerrados» con la evidencia (commit o PR) y actualizar este doc en
  el mismo commit que cierra el trabajo.
- Un ítem nuevo entra por P0 solo si bloquea una release o es de seguridad; el resto se prioriza
  en la revisión siguiente.

## Log

- L1 (usuario, verbatim): «ahora renueve toda la lista de los pendientes por hacer del proyecto».
- D1 (decisión): la renovación consolida cinco documentos fuente más los hallazgos de la
  verificación de 0.9.14 y el estado de GitHub de 2026-10-16; lo ya cerrado se lista como cerrado
  para que no reaparezca como pendiente.
