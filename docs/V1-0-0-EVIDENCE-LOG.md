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
