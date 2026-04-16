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

### 2026-04-15 — Implementación P1: Coverage gate en CI

- Issue: #38
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

- Issue: #36
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
