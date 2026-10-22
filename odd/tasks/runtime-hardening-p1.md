# Feature: runtime-hardening-p1 — Seguridad y correctness en runtime (P1 post-1.0.0)

> **Contexto**: Implementación de los 7 ítems de prioridad P1 del backlog post-1.0.0 (`odd/tasks/backlog-pendientes.md`), cubriendo correctness reactivo de atributos, aislamiento de memoria y scheduler, seguridad en servidor/SSR y robustez de portales/remociones DOM.

## Specs

- S1 (A1 - diff reactivo de attrs): `fastDiff` y `fullDiff` deben comparar y emitir operaciones para `attrs` en actualizaciones reactivas (`src/render/diff.ts`), y `commit.ts` debe aplicar cambios de atributos sanitizados y eliminar atributos retirados.
- S2 (A2 - limpieza de scratch en finally): `fullDiff` debe limpiar `scratch` (`resetDiffScratch()`) dentro de un bloque `finally` para no retener referencias fuertes a nodos y portales tras completar la llamada (`src/render/diff.ts`, `src/render/diff-scratch.ts`).
- S3 (A3 - aislamiento de colas en scheduler): `scheduleRender` debe aislar su cola y bandera `scheduled` por función `scheduler` o por instancia, permitiendo que múltiples apps con schedulers distintos convivan sin interferencias (`src/scheduler.ts`).
- S4 (F3-T9a - rechazo de symlinks en servidor): `validateStaticDir` y `resolveStaticFilePath` deben rechazar symlinks con `lstatSync`/`realpathSync` para evitar path traversal a través de enlaces simbólicos (`src/server.ts`).
- S5 (F3-T9b - escape de backticks en SSR): `escapeHtml` debe escapar backticks (`` ` `` → `&#96;`) en la serialización SSR (`src/ssr.ts`).
- S6 (K1 - verificación isConnected en portales CSR): `buildDOMTree` y `applyOps` en CSR deben verificar `portalTarget.isConnected` antes de montar o emitir warn si el target está desconectado (`src/render/commit.ts`).
- S7 (K2 - remoción DOM con parentNode): La fase de remoción de `applyOps` debe usar `node.parentNode?.removeChild(node)` en lugar de `node.parentElement` para soportar `ShadowRoot` y `DocumentFragment` (`src/render/commit.ts`).

## Tasks

- [x] T1 (linked S5): Escapar backticks en `escapeHtml` (`src/ssr.ts`) con test unitario de XSS/template literals. Route: inline. Commit: `8a87512`.
- [x] T2 (linked S4): Rechazar symlinks en `validateStaticDir` y `resolveStaticFilePath` (`src/server.ts`) con tests de seguridad. Route: inline. Commit: `5c29bf8`.
- [x] T3 (linked S3): Aislar colas por scheduler en `src/scheduler.ts` con tests de multi-scheduler independiente. Route: inline. Commit: `e3be6ef`.
- [x] T4 (linked S2): Envolver `fullDiff` en `try ... finally { resetDiffScratch() }` en `src/render/diff.ts` con test de liberación de memoria scratch. Route: inline. Commit: `4bcc0c8`.
- [x] T5 (linked S7): Cambiar remoción en `applyOps` a `node.parentNode?.removeChild(node)` en `src/render/commit.ts` con test en `ShadowRoot` / `DocumentFragment`. Route: inline. Commit: `ca451ef`.
- [x] T6 (linked S6): Verificar `portalTarget.isConnected` en CSR (`buildDOMTree` y `applyOps`) con warn en dev/test en `src/render/commit.ts`. Route: inline. Commit: `cd245ba`.
- [x] T7 (linked S1): Implementar diffing reactivo de `attrs` en `fastDiff` y `fullDiff` (`src/render/diff.ts`) y aplicación/remoción en `applyOps` (`src/render/commit.ts`) con tests TDD. Route: inline. Commit: `2cc737b`.
- [x] T8 (linked S1-S7): Sincronizar `odd/tasks/backlog-pendientes.md` marcando los 7 ítems P1 como cerrados y verificar suite completa. Route: inline. Commit: pending.

## Log

- L1 (usuario, verbatim): «lo de npm ya lo hice, proceda con la creación del plan para lo de P1»
