# Backlog de pendientes — actualización post-1.0.0 (2026-10-22)

Este documento es la **lista única vigente** de pendientes del proyecto. Los documentos fuente
(`axiom-hardening-plan.md`, `axiom-hardening.md`, `hardening-docs-sync.md`,
`npm-oidc-trusted-publishing.md`, `release-0.9.14-verification.md`) conservan el detalle
histórico y la evidencia; aquí solo vive el estado corriente: qué está abierto, con qué origen y
cuál es su siguiente acción concreta.

## Cerrados (no reabrir sin evidencia nueva)

- **Release `v1.0.0` publicada (`f0968d7`, tag `axiom-framework-v1.0.0`).** Unidades WU1–WU4
  fusionadas (#120–#129), release PR #125 fusionado, publicado en npm vía OIDC (run `39701949134`) y
  `release-please-config.json` limpiado tras `v1.0.0` (se retiró `last-release-sha` —ya cubierto por
  el tag `axiom-framework-v1.0.0` posterior a los reverts de septiembre— y las banderas `pre-major`,
  para que `release-please` avance su línea base automáticamente en cada release futura).
- **Release 0.9.14 fantasma (PR #118 y PR #119).** PR #118 y PR #119 cerrados sin mergear,
  ramas remotas de release-please eliminadas y 6 ramas huérfanas remotas con el typo `create-aviom`
  purgadas de GitHub.
- **R1 (Features fantasma de release-please).** Cerrado definitivamente con `last-release-sha`
  en `release-please-config.json` y el guard `scripts/validate-release-notes.ts` implementado en WU1.
- **R3 (`create-axiom` exit code al fallar `bun install`).** Cerrado en WU1 (`2dc584c`, PR #120) e
  issue #96 cerrado en lo relativo al código de salida.
- **Revisión de sourcery-ai en la cadena WU1-WU4.** Los 20 hallazgos del bot en los PRs #120-#123
  resueltos con fix, test y respuesta publicada; los 20 hilos quedaron resueltos. El guard de
  release se rediseñó sobre identidad de parche inverso y ahora sí corre en los PRs del bot
  (dispatch explícito + commit status `Release notes integrity`). Evidencia:
  `odd/evidence/sourcery-review/`. Detalle: `odd/tasks/sourcery-review-resolution.md`.
- **U1 (npm OIDC trusted publisher).** Confirmado funcionando en `0.9.13` y `1.0.0`.
- **R2 (CI sin jobs en ramas de release).** Cerrado 2026-10-16 (`axiom-next-version.md` L4).
- **F3-T1, F3-T2, F3-T7 (promesas de DOM reads en steady-state, style whitelist en dev y allowlist de hidratación).**
  Entregados en WU2 (`1c9c9c0`, `1b34ea3`, `f8dbfb7`, `d2ba618`, PR #121).
- **S1, S2 y L-1 parcial de F3-T9c (data URLs base64 en estilos SSR, eliminación de `resetIndexCounter` y restauración de URLs en una pasada).**
  Entregados en WU3 (`e42a7be`, `fe6cfc9`, `0467101`, PR #122).
- **D1, D2, D3, D4, D5 (layout del demo y decisión de skips en `bind`/`select`).** Cerrados en WU4
  (`653bba6`, `8141b66`, `da50147`, PR #123).
- **G2 (Issue #30 — EPIC Axiom v1.0.0 Readiness).** Cerrado con trazabilidad en `2823860`.
- **G3, G4 y T8 (higiene post-1.0.0).** Artefactos locales limpiados (`clean-test/`,
  `gh-run-latest-test.log`), ramas locales y remotas obsoletas podadas, y comentarios desfasados en
  `src/render/diff-scratch.ts`, `src/ssr.ts` y `docs/ARCHITECTURE.md` sincronizados.
- **R4 (Required status check `Release notes integrity` en `main`).** Entregado en PR #131 y
  ruleset `Main Protection` (`id: 14692155`) actualizado con `required_status_checks` para el
  contexto `Release notes integrity`.
- **U2 parcial (GitHub).** Secreto `NPM_TOKEN` eliminado de GitHub (`gh secret delete NPM_TOKEN`).
- **demo-ui-polish T1-T6**, **hardening-docs-sync T1-T4**, **npm-oidc T1-T4**, **Hardening Fases 0, 1 y 2** (salvo F2-T7): entregados.

## P0 — Gobernanza de repositorio y npm (configuración externa post-1.0.0)

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| U2 | Revocar el token npm de larga duración en npmjs.com tras el publish OIDC exitoso de `1.0.0` | npm-oidc U2 | Pendiente revocar token en npmjs.com (Settings → Tokens) por el mantenedor |
| U3 | Marcar Publishing access con 2FA requerida y sin tokens | npm-oidc U3 | Configurar en npmjs.com (Package settings → Publishing access) |

## P1 — Seguridad y correctness en runtime (Fase 3 del hardening + auditoría post-1.0.0)

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| A1 | `fastDiff` y `fullDiff` no comparan ni emiten operaciones para `attrs` en actualizaciones reactivas (`src/render/diff.ts:212-304, 409-473`) | auditoría post-1.0.0 | Difear `attrs` y aplicar cambios/remociones en `commit.ts` + test |
| A2 | `diff-scratch.ts` retiene referencias fuertes a nodos y portales tras `fullDiff()` (`src/render/diff-scratch.ts:34-55`) | auditoría post-1.0.0 | Limpiar `scratch` en bloque `finally` al terminar `fullDiff()` + test |
| A3 | `scheduleRender` comparte un único flag `scheduled` global entre múltiples apps con `scheduler` distinto (`src/scheduler.ts:8-27`) | auditoría post-1.0.0 | Aislar la cola por `scheduler` o por instancia + test |
| F3-T9a | L-3: `validateStaticDir` y `resolveStaticFilePath` aceptan symlinks (`src/server.ts:69-80, 107-118`) | plan FASE 3 | Rechazar symlinks con `lstatSync`/`realpathSync` + test |
| F3-T9b | L-4: `escapeHtml` no escapa backticks (`src/ssr.ts:360`) | plan FASE 3 | Añadir backtick al escape + test |
| K1 | H-12: `buildDOMTree` y `applyOps` no verifican `portalTarget.isConnected` en CSR (`src/render/commit.ts:402-419, 557-573`) | catálogo | Verificar `isConnected` y degradar con warn como en hidratación + test |
| K2 | H-13: la fase de remoción de `applyOps` usa `node.parentElement` en lugar de `node.parentNode` (`src/render/commit.ts:342-344`) | catálogo | Cambiar a `node.parentNode?.removeChild(node)` + test con `ShadowRoot`/`DocumentFragment` |

## P2 — Contratos, invariantes y cobertura

| ID | Pendiente | Origen | Siguiente acción |
| --- | --- | --- | --- |
| F2-T7 | H-7 excluida: la optimización de `notifySubscribers` congelaba el demo | plan, salvedad 2 | Reabrir solo después de T5 (comentario de invariante en `signals.ts` + test que convierta el cuelgue en fallo rápido) |
| T5 | Comentario de invariante en `src/reactivity/signals.ts` + test de regresión del cuelgue | docs-sync T5 | Implementar comentario y test acotado |
| F3-T3 | H-10: `axiom-premise-guard.md` desactualizado | plan FASE 3 | Archivar o poner banner de estado; mover tareas abiertas a `axiom-hardening.md` |
| F3-T4 | M-1: unions de `VALID_JUSTIFY_VALUES`/`VALID_ALIGN_VALUES` con sync manual; falta `VALID_FLEX_WRAP_VALUES` (`src/core/types.ts:81-82`) | plan FASE 3 | Derivar types con `as const satisfies` + test de drift |
| F3-T5 | M-2: `For()` con child fragment promete advertencia en dev pero no la emite (`src/syntax/flow.ts:43-44`) | plan FASE 3 | `console.warn` en dev + test |
| F3-T6 | M-4, M-5, M-10: `pattern(regex)` falla con flags `/g` o `/y` (`src/features/forms.ts:250-252`) y faltan tests de fail-fast en `runSyncRules` | plan FASE 3 | Normalizar/resetear `lastIndex` en `pattern()` y añadir los tests |
| F3-T8 | M-13: threshold del heap delta en 4 KB/call enmascara leaks pequeños (`tests/architecture/engines-allocation-bounded.test.ts:153`) | plan FASE 3 | Bajar a 256 B/call y verificar baseline |
| F3-T9c | L-2 (`commitHydrate` itera `getElementsByTagName('*')` completo) y L-5 (`installDevHook` sobrescribe `window.__AXIOM__` sin warn en multi-app) | plan FASE 3 | Acotar recorrido en hidratación y emitir warn en re-mount + tests |
| K3 | M-3, M-6, M-7, M-8, M-9 sin tarea en el plan | catálogo | Revisar uno a uno: resueltos en Fases 1-2, aceptados como wont-fix, o crear tarea |
| D6 | Cobertura floja en `src/syntax/h.dev.ts` (ramas de warnings en dev), `server.ts` y `ssr.ts` | coverage gate | Añadir tests unitarios directos sobre `hDev()` y ramas faltantes |
| G1 | Re-planificar el endurecimiento restante del CLI `create-axiom` (directory guard, nombres reservados en Windows, personalización de static build) | issue #96 | Re-planificar en unidades limpias con los aprendizajes del revert de septiembre |

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
