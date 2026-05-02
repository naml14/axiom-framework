# Evidence Log — Axiom v1.0.0

Registro cronológico de evidencia verificable para el release 1.0.0.

## Cómo usar este archivo

Cada entrada debe incluir:

- Fecha
- Issue
- PR
- Qué se verificó
- Evidencia concreta (tests, coverage, archivos)
- Resultado (PASS/FAIL)

Plantilla:

```md
### YYYY-MM-DD — [Título corto]
- Issue: #XXX
- PR: #YYY
- Verificación:
  - [ ] `bun test`
  - [ ] `bun test --coverage`
  - [ ] `bun run typecheck`
  - [ ] Seguridad/Docs según aplique
- Evidencia:
  - tests: ...
  - coverage: ...
  - archivos: ...
- Resultado: PASS | FAIL
- Notas/Riesgos:
```

---

## Entradas

### 2026-05-01 — M3 — Validación integral de release v1.0.0

- Issue: #30 (épica 1.0.0)
- PR: TBD
- Verificación:
  - [x] `bun run validate:api` — 125 stable exports, 5 experimental, 0 beta/untagged
  - [x] `bun run test:coverage` — 96.95% line coverage >= threshold 85%
  - [x] `bun test tests/ssr.test.ts tests/hydration.test.ts` — 20 pass / 0 fail
  - [x] `bun test` — 540 pass / 2 skip / 0 fail
  - [x] `bun run typecheck` — 0 errors
- Evidencia:
  - API stability: `docs/STABILITY.md` exists with contract v1.0.0
  - Experimental APIs documented for this release: `renderToReadableStream`, `StreamSSROptions`, `createServer`, `AxiomServer`, `AxiomServerOptions`
  - Coverage gate: `scripts/validate-coverage.ts` parsed and passed
  - SSR/hydration regression: `tests/ssr.test.ts` (100% lines), `tests/hydration.test.ts` (97.96% lines)
  - archivos: `docs/V1-0-0-EVIDENCE-LOG.md`, `docs/V1-0-0-PLAN-TRAZABILIDAD.md`
- Resultado: PASS
- Notas: feat/v1-0-0-kickoff branch es obsoleto — main ya supera kickoff con strict-types-sprint + syntax-layer-v2. Release desde main.

### 2026-05-01 — Implementado: Static Site Generation API (buildStatic)

- Issue: #48
- PR: TBD (rama local SDD `static-site-generation`)
- Verificación:
  - [x] `bun run typecheck` — 0 errores
  - [x] `bun test tests/build.test.ts` — 9 pass / 0 fail
- Evidencia:
  - API pública `buildStatic()` en `src/build.ts` con interfaces `StaticRoute`, `BuildStaticOptions`, `BuildResult`
  - Exportada desde `src/index.ts` como `@stable`
  - Tests: filesystem output, HTML correctness, metadata injection, multiple routes, edge cases
  - `demo/build.ts` refactorizado para usar `buildStatic()` internamente
  - Script `build:static` añadido a `package.json`
  - archivos: `src/build.ts`, `src/index.ts`, `tests/build.test.ts`, `demo/build.ts`, `docs/STATIC-BUILD-MINIFICATION.md`
- Resultado: PASS

### 2026-04-16 — Fix P0: fast path no detecta cambios de clases CSS en re-render

- Issue: #43
- PR: #44 (rama `fix/issue-43-class-diff`)
- Verificación:
  - [x] `bun run typecheck` — limpio (0 errores)
  - [x] `bun test` — 417 pass / 2 skip / 0 fail
- Evidencia:
  - Root cause: `fullDiff` fast path y `fullTreeDiff` nunca comparaban el array `classes`; `applyOps` no tenía handler para `newClasses`; el fast path emitía coords de layout para cambios de metadata, rompiendo portal CSS-managed children.
  - Fix: helper `classesEqual()`, campo `newClasses?: string[]` en `DOMOperation`, separación de `layoutChangedSet` vs `allChangedSet` en fast path (coords solo cuando layout cambió), detección de `classesChanged` en `fullTreeDiff`, handler `el.className` en `applyOps`.
  - Nuevos tests: `same-shape fast path detecta cambio de clases y emite newClasses sin coords de layout`, `fullTreeDiff detecta cambio de clases`, `applyOps aplica newClasses`, `applyOps con newClasses vacío limpia className`.
  - archivos: `src/render/diff.ts`, `src/render/commit.ts`, `tests/diff.test.ts`, `tests/commit.test.ts`
- Resultado: PASS
- Notas/Riesgos:
  - Bug secundario (coords emitidas para nodos de portal CSS-managed en cambios de metadata) corregido como parte del mismo fix — separación de `layoutChangedSet`.

### 2026-04-15 — Snapshot final local pre-PR (release readiness)

- Issue: #30 (épica 1.0.0)
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun run typecheck`
  - [x] `bun run test:coverage`
  - [x] Revisión de trazabilidad P0/P1 en plan maestro
- Evidencia:
  - checks: typecheck en verde
  - coverage: `All files % Lines 96.15%` (threshold gate 85.00%)
  - tests: suite completa (476 pass / 2 skip / 0 fail)
  - archivos: `docs/V1-0-0-PLAN-TRAZABILIDAD.md`, `docs/V1-0-0-EVIDENCE-LOG.md`
- Resultado: PASS
- Notas/Riesgos:
  - CI de PR pendiente para confirmar verde remoto antes de merge.

### 2026-04-15 — Implementación P1: Optimización incremental de diff (index lookup)

- Issue: #38
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/diff.test.ts`
  - [x] `bun test tests/integration.test.ts`
  - [x] `bun test tests/benchmark.test.ts`
- Evidencia:
  - tests: `diff.test.ts` + `integration.test.ts` + `benchmark.test.ts` (63 passed / 0 failed)
  - benchmark smoke: `fullDiff` same-shape (~1000 nodos) bajo umbral CI (200ms)
  - archivos: `src/render/diff.ts`, `tests/diff.test.ts`, `tests/benchmark.test.ts`
  - comportamiento validado: reemplazo de búsquedas lineales repetidas por mapas de índice (`Map`) y deduplicación O(1) con `Set`, manteniendo semántica de operaciones.
- Resultado: PASS
- Notas/Riesgos:
  - Umbral de benchmark puede variar por runner/entorno; se mantiene como smoke gate para detectar regresiones gruesas.
  - Nota de trazabilidad: commits históricos como `3a3b7fa` referenciaron `#40`, pero el issue canónico en GitHub para esta optimización es `#38`.

### 2026-04-15 — Implementación P1: Hardening XSS residual + alineación docs/código

- Issue: #40
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/commit.test.ts`
  - [x] `bun test tests/ssr.test.ts`
  - [x] Revisión de `SECURITY.md`
- Evidencia:
  - tests: `commitHydrate: security hardening` (remove `on*`, neutralize `javascript:` a `#blocked`, preservación de attrs seguros) y `SSR: attrs security policy`
  - archivos: `src/render/commit.ts`, `tests/commit.test.ts`, `tests/ssr.test.ts`, `SECURITY.md`, `docs/V1-0-0-EVIDENCE-LOG.md`, `docs/V1-0-0-PLAN-TRAZABILIDAD.md`
  - comportamiento validado: hidratación sanea attrs peligrosos preexistentes del DOM reutilizado y alinea la política documentada de seguridad con el comportamiento real de SSR/hidratación.
- Resultado: PASS
- Notas/Riesgos:
  - Endurecimiento deliberado sobre DOM inseguro preexistente; no se introduce reconciliación completa de attrs benignos en hidratación.

### 2026-04-15 — Implementación P1: Coverage gate en CI

- Issue: #36
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun run test:coverage`
  - [x] `bun run typecheck`
  - [x] Integración del gate en workflow de CI
- Evidencia:
  - checks: `test:coverage` (line coverage global 96.10% >= threshold 85.00%)
  - tests: suite completa (469 pass / 2 skip / 0 fail)
  - archivos: `.github/workflows/ci.yml`, `scripts/validate-coverage.ts`, `package.json`, `.gitignore`, `docs/TESTING-GUIDE.md`, `tests/scheduler.test.ts`
  - comportamiento validado: CI falla si fallan tests, si cambia formato de coverage no parseable, o si `% Lines` global cae por debajo de 85%.
- Resultado: PASS
- Notas/Riesgos:
  - El parser depende de la fila `All files`; si Bun cambia el formato, el gate falla explícitamente como `coverage-format-failure`.

### 2026-04-15 — Implementación P1: Scheduler API coherente (setScheduler funcional)

- Issue: #37
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/scheduler.test.ts`
  - [x] `bun test tests/app.test.ts`
  - [x] Compatibilidad con scheduler por llamada (`scheduleRender(..., scheduler?)`)
- Evidencia:
  - tests: `scheduler.test.ts` + `app.test.ts` (36 passed / 0 failed)
  - archivos: `src/scheduler.ts`, `tests/scheduler.test.ts`
  - comportamiento validado: `setScheduler()` dejó de ser no-op; scheduler global configurable y `resetScheduler()` restaura default scheduler.
- Resultado: PASS
- Notas/Riesgos:
  - Riesgo residual bajo de contaminación en tests/integraciones si no se llama `resetScheduler()` tras set global custom.

### 2026-04-15 — Implementación P1: Hardening attrs/event attrs

- Issue: #39
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/edge-cases.test.ts`
  - [x] `bun test`
  - [x] Validación de attrs en CSR y SSR
- Evidencia:
  - tests: `edge-cases.test.ts` (44 passed / 0 failed), suite total (466 pass / 0 fail)
  - archivos: `src/core/attrs.ts`, `src/render/commit.ts`, `src/ssr.ts`, `tests/edge-cases.test.ts`, `SECURITY.md`
  - comportamiento validado: bloqueo de event attrs inline, neutralización de schemes peligrosos (`javascript:`, `data:`, `vbscript:`, `file:`), validación de nombres de atributos.
- Resultado: PASS
- Notas/Riesgos:
  - Compatibilidad mantenida: atributos seguros y URLs legítimas permanecen sin alteración.

### 2026-04-15 — Implementación P0: API stability contract v1.0.0

- Issue: #34
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun run validate:api`
  - [x] `bun test tests/app.test.ts`
  - [x] Documento de contrato API generado y versionado
- Evidencia:
  - checks: `validate:api` (95 stable / 0 beta / 0 experimental / 0 untagged)
  - tests: `app.test.ts` (29 passed / 0 failed)
  - archivos: `scripts/validate-api-stability.ts`, `docs/STABILITY.md`, `src/index.ts`, `src/testing.ts`, `package.json`, `.gitignore`
  - comportamiento validado: superficie pública de API con contrato explícito v1.0.0 y validación automatizable.
- Resultado: PASS
- Notas/Riesgos:
  - Política kickoff: export público no etiquetado se considera `stable` en v1.0.0; en fase posterior conviene migrar a tags explícitos por export.

### 2026-04-15 — Implementación P0: SECURITY threat model real (CSR + SSR)

- Issue: #35
- PR: #41
- Verificación:
  - [x] Revisión de `SECURITY.md`
  - [x] Coherencia de alcance CSR + SSR
  - [x] Responsabilidades del consumidor documentadas
- Evidencia:
  - archivos: `SECURITY.md`
  - comportamiento validado: el threat model documenta explícitamente CSR y SSR, delimita scope/out-of-scope y aclara responsabilidades sobre sanitización de input, attrs, URLs y riesgos de plugins.
  - commit relacionado: `3df31b8` (`docs(security): update threat model for v1.0.0 (CSR+SSR, plugins, API stability)`)
- Resultado: PASS
- Notas/Riesgos:
  - La issue quedó abierta por falta de autocierre en PR/commit, no por ausencia de implementación técnica.

### 2026-04-15 — Implementación P0: Plugin lifecycle runtime

- Issue: #32
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/app.test.ts`
  - [x] `bun test tests/plugin.test.ts`
  - [x] Integración runtime `onMount`/`onUpdate`/`onUnmount`
- Evidencia:
  - tests: `app.test.ts` + `plugin.test.ts` (41 passed / 0 failed)
  - archivos: `src/app.ts`, `tests/app.test.ts`, `demo/ruta-b-showcase.ts`
  - comportamiento validado: hooks de plugin conectados al ciclo real de `createApp`; `onUnmount` solo cuando la app estuvo montada; `appId` estable por instancia.
- Resultado: PASS
- Notas/Riesgos:
  - Riesgo residual bajo: mantener hooks post-pipeline (`prepare -> reflow -> commit`) en futuros refactors.

### 2026-04-15 — Implementación P0: Aislamiento SSR en `prepare`

- Issue: #31
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/prepare.test.ts`
  - [x] `bun test tests/portal.test.ts`
  - [x] `bun test tests/router.test.ts`
  - [x] Revisión de aislamiento por invocación (sin contador global)
- Evidencia:
  - tests: `prepare.test.ts` + `portal.test.ts` + `router.test.ts` (80 passed / 0 failed)
  - archivos: `src/render/prepare.ts`, `tests/prepare.test.ts`
  - comportamiento validado: asignación de índices local por invocación de `prepare`; sin contaminación por re-entrada conceptual SSR.
- Resultado: PASS
- Notas/Riesgos:
  - `resetIndexCounter()` se mantiene por compatibilidad pública y ahora es no-op al no existir estado global.

### 2026-04-15 — Inicio implementación P0: Router SSR-safe

- Issue: #33
- PR: TBD (rama local `feat/v1-0-0-kickoff`)
- Verificación:
  - [x] `bun test tests/router.test.ts`
  - [ ] `bun test --coverage`
  - [ ] `bun run typecheck`
  - [x] Revisión de compatibilidad SSR sin `window`
- Evidencia:
  - tests: `tests/router.test.ts` (26 passed / 0 failed)
  - archivos: `src/router.ts`, `tests/router.test.ts`
  - comportamiento validado: `createRouter` funciona en entorno servidor sin acceso a `window`; `push/replace/go/dispose` son seguros en SSR.
- Resultado: PASS
- Notas/Riesgos:
  - En SSR, la ruta inicial por defecto es `'/'`; si se requiere ruta por request, se implementará como siguiente mejora sin romper API.

### 2026-04-15 — Baseline de auditoría 1.0.0

- Issue: #30 (épica), #31, #32, #33, #34, #35, #36, #37, #38, #39, #40
- PR: N/A
- Verificación:
  - [x] `bun test`
  - [x] `bun test --coverage`
  - [x] Revisión de CI/workflows y seguridad
- Evidencia:
  - tests: verde (sin fallos)
  - coverage: reporte generado en terminal
  - archivos: `package.json`, `SECURITY.md`, `src/app.ts`, `src/router.ts`, `src/ssr.ts`, `src/render/{prepare.ts,commit.ts,diff.ts}`, `.github/workflows/*`
- Resultado: PASS (baseline audit)
- Notas/Riesgos:
  - Persisten P0 de contrato/API y SSR para resolver antes de 1.0.0.
