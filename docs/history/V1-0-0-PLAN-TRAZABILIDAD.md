# Plan maestro y trazabilidad — Axiom v1.0.0

> Estado inicial: **2026-04-15**
> Estado actual (2026-10-16): **P0 5/5 y P1 5/5 merged y cerrados; EPIC #30 cerrado con la
> sección 9 de este documento; pendiente solo la decisión de numeración del release
> (ver `odd/tasks/axiom-next-version.md`)**
> Objetivo: lanzar `v1.0.0` con calidad **excelente** en estabilidad API, SSR/hydration, seguridad, testing y operación.

## 1) Objetivo y alcance

Este plan convierte la auditoría técnica en ejecución concreta con criterios Go/No-Go.

### Principios

- No romper invariantes del framework (`prepare -> reflow -> commit`, hot path sin lecturas DOM).
- No publicar 1.0.0 con APIs ambiguas, inertes o sin contrato de estabilidad.
- Trazabilidad completa: cada tarea crítica debe tener issue, PR, evidencia y estado.

---

## 2) Baseline de entrada (audit snapshot)

- Tests: verdes.
- Cobertura: alta (medida localmente).
- Gaps críticos detectados:
  - Plugin lifecycle no integrado en runtime.
  - Router no SSR-safe (dependencia directa de `window`).
  - Riesgo de estado global en `prepare` para SSR concurrente.
  - SECURITY.md desalineado con superficie real (SSR existe).
  - Falta de “API freeze contract” explícito para 1.0.0.

---

## 3) Fases de ejecución

## Fase M0 — Gate de release y trazabilidad (1-2 días)

- [x] Crear épica 1.0.0 + issues hijas (P0/P1/P2).
- [x] Definir tablero de estado en este documento + log de evidencia.
- [x] Establecer checklist Go/No-Go de release.

## Fase M1 — Cierre P0 (3-7 días)

- [x] Integrar hooks de plugin en ciclo de vida de app.
- [x] Hacer router SSR-safe sin `window` en servidor.
- [x] Eliminar dependencia de contador global para aislamiento SSR.
- [x] Actualizar threat model en SECURITY.md.
- [x] Publicar contrato de estabilidad API 1.0 (`stable/experimental/internal`).

## Fase M2 — Cierre P1 (1-2 semanas)

- [x] Hardening adicional de attrs/event attrs y URL schemes.
- [x] Resolver APIs no-op/ambiguas (ej. scheduler API vacía).
- [x] Añadir gate de coverage en CI.
- [x] Hardening XSS residual en hidratación + alineación docs/código.
- [x] Optimización incremental en diff para escalabilidad.

## Fase M3 — Validación integral (3-5 días)

- [ ] Verificación de regresión SSR/hydration en escenarios edge.
- [ ] Pruebas de aislamiento multi-app/multi-context.
- [ ] Verificación de release dry-run y checklist final.

## Fase M4 — Release 1.0.0

- [ ] Release PR con `release-as: 1.0.0`.
- [ ] Verificación de artefacto publicado.
- [ ] Cierre de épica + snapshot final de evidencia.

---

## 4) Backlog priorizado (resumen)

| Prioridad | Tema | Impacto | Estado |
| --- | --- | --- | --- |
| P0 | Plugin lifecycle runtime | Correctness/API contract | Done (branch) (#32) |
| P0 | Router SSR-safe | SSR correctness | Done (branch) (#33) |
| P0 | Aislamiento SSR (`prepare`) | Reliability/concurrency | Done (branch) (#31) |
| P0 | SECURITY.md threat model | Security governance | Done (branch) (#35) |
| P0 | API stability contract | SemVer/compatibilidad | Done (branch) (#34) |
| P1 | Hardening attrs/event attrs | Security hardening | Done (branch) (#39) |
| P1 | Scheduler API no-op | API coherence | Done (branch) (#37) |
| P1 | Coverage gate en CI | Release quality gate | Done (branch) (#36) |
| P1 | Hardening XSS residual + alineación docs/código | Security/DX trust | Done (branch) (#40) |
| P1 | Diff performance index lookup | Performance/scalability | Done (branch) (#38) |

---

## 5) Definition of Ready (Go / No-Go)

El release `1.0.0` solo puede aprobarse si:

- [x] Todos los issues P0 cerrados (implementados en rama).
- [x] Al menos 80% de P1 cerrados o explícitamente diferidos con justificación.
- [ ] CI verde + coverage gate activo y cumpliendo umbral (pendiente ejecución en PR).
- [x] SECURITY.md actualizado al modelo real del framework.
- [x] Documento de estabilidad API 1.0 publicado.
- [ ] Changelog/release notes alineadas con cambios reales.

---

## 6) Matriz de trazabilidad (Issue ↔ PR ↔ Evidencia)

> Completar conforme se creen issues y PRs.

| Item | Issue | PR | Evidencia (tests/coverage/doc) | Estado |
| --- | --- | --- | --- | --- |
| P0 Plugin lifecycle runtime | #32 | #41, #42 | `tests/app.test.ts` + `tests/plugin.test.ts` + `docs/history/V1-0-0-EVIDENCE-LOG.md` | Done (merged) |
| P0 Router SSR-safe | #33 | #41, #42 | `tests/router.test.ts` + `docs/history/V1-0-0-EVIDENCE-LOG.md` | Done (merged) |
| P0 Aislamiento SSR prepare | #31 | #41, #42 | `tests/prepare.test.ts` + `tests/portal.test.ts` + `tests/router.test.ts` + `docs/history/V1-0-0-EVIDENCE-LOG.md` | Done (merged) |
| P0 SECURITY threat model | #35 | #41, #46 | `SECURITY.md` + `docs/history/V1-0-0-EVIDENCE-LOG.md` | Done (merged) |
| P0 API stability contract | #34 | #41, #42 | `scripts/validate-api-stability.ts` + `docs/STABILITY.md` + `bun run validate:api` | Done (merged) |
| P1 Hardening attrs/event attrs | #39 | #41, #42, #46 | `tests/edge-cases.test.ts` + suite coverage + `SECURITY.md` | Done (merged) |
| P1 Scheduler API no-op | #37 | #41, #42, #46 | `tests/scheduler.test.ts` + `tests/app.test.ts` | Done (merged) |
| P1 Coverage gate en CI | #36 | #41, #42, #46 | `.github/workflows/ci.yml` + `scripts/validate-coverage.ts` + `bun run test:coverage` | Done (merged) |
| P1 Hardening XSS residual + alineación docs/código | #40 | #41, #42, #46 | `tests/commit.test.ts` + `tests/ssr.test.ts` + `SECURITY.md` + `docs/history/V1-0-0-EVIDENCE-LOG.md` | Done (merged) |
| P1 Diff performance | #38 | #41, #46 | `tests/diff.test.ts` + `tests/integration.test.ts` + `tests/benchmark.test.ts` | Done (merged) |

---

## 6.1) Mapa GitHub (épica + hijas)

- Épica principal: #30
- P0:
  - #32 Plugin lifecycle runtime
  - #33 Router SSR-safe
  - #31 Aislamiento SSR prepare
  - #35 SECURITY threat model
  - #34 API stability contract
- P1:
  - #39 Hardening attrs/event attrs
  - #37 Scheduler API no-op
  - #36 Coverage gate CI
  - #40 Hardening XSS residual + alineación docs/código
  - #38 Diff performance

---

## 7) Cadencia recomendada de seguimiento

- **Diaria (15 min):** mover estado en issues + actualización rápida de matriz.
- **Semanal:** revisión de riesgo, burn-down de P0/P1, decisiones de alcance.
- **Por PR:** enlazar issue obligatoriamente y actualizar evidencia en `docs/history/V1-0-0-EVIDENCE-LOG.md`.

---

## 8) Convenciones de estado

- `Open` → sin trabajo iniciado
- `In Progress` → PR en curso
- `Blocked` → dependencia externa o decisión pendiente
- `Done` → merged y verificado
- `Deferred` → acordado fuera de 1.0.0 con justificación

---

## 9) Cierre del EPIC #30 (2026-10-16)

- Las 10 issues hijas (#31-#40) están closed/completed; los merges que las cerraron quedan
  registrados en la matriz de la sección 6 (PR #41, #42 y #46, según cada ítem).
- Checklist go/no-go: P0 5/5 cerrado; P1 5/5 cerrado; CI verde con coverage gate activo
  (`scripts/validate-coverage.ts` en CI); evidencia por ítem en
  `docs/history/V1-0-0-EVIDENCE-LOG.md` (entrada 2026-10-16) más la verificación de release de
  `odd/tasks/release-0.9.14-verification.md` y su evidencia en `odd/evidence/release-0.9.14/`.
- Gaps remanentes de contrato resueltos en la rama `feat/next-version-release-integrity`
  (S1: data URLs base64 en estilos SSR con paridad de attrs.ts; S2: retiro de resetIndexCounter;
  enforcement de DOM reads del hot path y del whitelist de estilos; allowlist documentada de
  commitHydrate): detalle y specs en `odd/tasks/axiom-next-version.md`.
- Única decisión pendiente: numeración del release (1.0.0 vs 0.10.0), que se toma al cerrar WU3
  según D2 del mismo documento.
- Con esta sección y la entrada de evidencia 2026-10-16, el EPIC #30 queda cerrado.
