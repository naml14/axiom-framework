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
