# Backlog de pendientes — renovación 2026-10-16

Este documento es la **lista única vigente** de pendientes del proyecto. Los documentos fuente
(`axiom-hardening-plan.md`, `axiom-hardening.md`, `hardening-docs-sync.md`,
`npm-oidc-trusted-publishing.md`, `release-0.9.14-verification.md`) conservan el detalle
histórico y la evidencia; aquí solo vive el estado corriente: qué está abierto, con qué origen y
cuál es su siguiente acción concreta.

## Cerrados en esta renovación (no reabrir sin evidencia nueva)

- **Release 0.9.14 fantasma (PR #118 y PR #119).** PR #118 y PR #119 cerrados sin mergear,
  ramas remotas de release-please eliminadas y 6 ramas huérfanas remotas con el typo `create-aviom`
  purgadas de GitHub. `release-please-config.json` blindado con `last-release-sha` en `372a0e0`
  para que el bot no vuelva a escanear los commits revertidos de septiembre.
- **R1 (Features fantasma de release-please).** Cerrado definitivamente con `last-release-sha`
  en `release-please-config.json` y el guard `scripts/validate-release-notes.ts` implementado en WU1.
- **Revisión de sourcery-ai en la cadena WU1-WU4.** Los 20 hallazgos del bot en los PRs #120-#123
  resueltos con fix, test y respuesta publicada; los 20 hilos quedaron resueltos. El guard de
  release se rediseñó sobre identidad de parche inverso y ahora sí corre en los PRs del bot
  (dispatch explícito + commit status `Release notes integrity`). Evidencia:
  `odd/evidence/sourcery-review/`. Detalle: `odd/tasks/sourcery-review-resolution.md`.
- **U1 (npm OIDC trusted publisher).** Confirmado funcionando: 0.9.13 publicado vía OIDC el
  2026-09-23T20:49Z, ~2 min después del release de GitHub.
- **Limpieza de ramas.** 4 remotas ya mergeadas y 3 locales fusionadas borradas; rama
  `chore/revert-create-aviom-merges` eliminada y repositorio en `main` al día.
- **R2 (CI sin jobs en ramas de release).** Cerrado 2026-10-16: no eran fallos de tests sino runs
  de PRs de bot que nunca arrancaron (aprobación pendiente o invalidados por force-push/borrado);
  GitHub los finaliza como `failure` sin jobs ni logs. Evidencia: `axiom-next-version.md` L4.
- **D1, D2, D3 (layout del demo).** Cerrados 2026-10-16 en `feat/next-version-release-integrity`
  (commit `653bba6`): el motor posee el layout en Syntax, Grid y hero-titles; probe de navegador
  before/after en `.verify-tmp/evidence/t11-{before,after}.json`.
- **D4 y D5.** Cerrados por decisión 2026-10-16 (desktop-first documentado; skips mantenidos con
  la decisión en el mensaje), commit `8141b66`.
- **demo-ui-polish T1-T6**, **hardening-docs-sync T1-T4**, **npm-oidc T1-T4**: entregados.
- **Hardening Fases 0, 1 y 2**: entregadas (F2-T7 excluida, ver P2).

## P0 — Afectan a la próxima release

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| R3 | `create-axiom` termina con exit 0 e imprime «Ready!» aunque `bun install` falle | issue #96; reproducido en head de release | Fix del exit code + test que lo pine: `axiom-next-version` T2 (ya implementado en WU1 / PR #120) |
| R4 | Configurar `Release notes integrity` como required status en las reglas de protección de la rama de release | `sourcery-review-resolution.md` S120-A | Los workflows ya publican ese estado en el SHA del PR de release y bloquean el merge cuando el guard falla, pero el requisito se configura en la UI de GitHub, no en el repo. Verificado en verde y en rojo con un run real (`39656976978`) |

## P1 — Seguridad y correctness (Fase 3 del hardening, sin iniciar)

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| F3-T1 | C-4 + M-12: `src/app.ts:getConstraints()` hace 4 DOM reads por update cycle y el enforcement test no escanea `src/app.ts` | plan FASE 3 | **Resuelto en WU2** (`d2ba618`): allowlist explícita justificada, `src/app.ts` escaneado, test de enforcement en steady state y refresh en resize. Pendiente: cerrar en el plan de FASE 3 |
| F3-T2 | H-9: `validateStyleProps` nunca se llama; el whitelist se rompe en runtime | plan FASE 3 | **Resuelto en WU2** (`d2ba618`): se llama en dev en `applyStyleToElement` con test de prop maliciosa, y el sanitizado de valores se aplica en todos los builds. Pendiente: cerrar en el plan de FASE 3 |
| F3-T7 | M-11: `commitHydrate` lee DOM extensivamente sin allowlist documentada | plan FASE 3 | **Resuelto en WU2** (`f8dbfb7`, `d2ba618`): JSDoc con la allowlist, demarcación en el test y allowlist actualizada con las lecturas CSSOM reales |
| F3-T9a | L-3: `validateStaticDir` acepta symlinks | plan FASE 3 | Rechazar symlinks + test |
| F3-T9b | L-4: `escapeHtml` no escapa backticks | plan FASE 3 | Añadir backtick al escape + test |
| S1 | C-1 parcial: `escapeStyleText` descarta `url(...)` con `data:image` base64 legítima en estilos inline SSR | docs-sync T7; `SECURITY.md` | **Resuelto en WU3** (`fe6cfc9`): se soporta `url(data:…)` saneado en SSR con paridad de subtipos con `attrs.ts` |
| S2 | H-11 / F1-T7: `resetIndexCounter` marcado `@deprecated` pero no re-exportado; el validador seguirá en `Deprecated: 0` | docs-sync T6 | **Resuelto en WU3** (`e42a7be`): se eliminó la exportación inerte `resetIndexCounter` |

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
| F3-T9c | L-1 (`escapeStyleText` O(n²)), L-2 (`commitHydrate` itera el DOM completo), L-5 (`installDevHook` sin warn en re-mount) | plan FASE 3 | L-1 **resuelto en WU3** (`0467101`): la restauración de placeholders es una sola pasada. Pendientes L-2 y L-5: bounded loop, iterar solo subtree, warn; con tests |

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
