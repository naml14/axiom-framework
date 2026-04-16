# Plan maestro y trazabilidad — Axiom v1.0.0

> Estado inicial: **2026-04-15**
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

- [ ] Crear épica 1.0.0 + issues hijas (P0/P1/P2).
- [ ] Definir tablero de estado en este documento + log de evidencia.
- [ ] Establecer checklist Go/No-Go de release.

## Fase M1 — Cierre P0 (3-7 días)

- [ ] Integrar hooks de plugin en ciclo de vida de app.
- [ ] Hacer router SSR-safe sin `window` en servidor.
- [ ] Eliminar dependencia de contador global para aislamiento SSR.
- [ ] Actualizar threat model en SECURITY.md.
- [ ] Publicar contrato de estabilidad API 1.0 (`stable/experimental/internal`).

## Fase M2 — Cierre P1 (1-2 semanas)

- [ ] Hardening adicional de attrs/event attrs y URL schemes.
- [ ] Resolver APIs no-op/ambiguas (ej. scheduler API vacía).
- [ ] Añadir gate de coverage en CI.
- [ ] Hardening XSS residual en hidratación + alineación docs/código.
- [ ] Optimización incremental en diff para escalabilidad.

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
| P0 | Plugin lifecycle runtime | Correctness/API contract | Open (#32) |
| P0 | Router SSR-safe | SSR correctness | Open (#33) |
| P0 | Aislamiento SSR (`prepare`) | Reliability/concurrency | Open (#31) |
| P0 | SECURITY.md threat model | Security governance | Open (#35) |
| P0 | API stability contract | SemVer/compatibilidad | Open (#34) |
| P1 | Hardening attrs/event attrs | Security hardening | Open (#36) |
| P1 | Scheduler API no-op | API coherence | Open (#37) |
| P1 | Coverage gate en CI | Release quality gate | Open (#38) |
| P1 | Hardening XSS residual + alineación docs/código | Security/DX trust | Open (#39) |
| P1 | Diff performance index lookup | Performance/scalability | Open (#40) |

---

## 5) Definition of Ready (Go / No-Go)

El release `1.0.0` solo puede aprobarse si:

- [ ] Todos los issues P0 cerrados.
- [ ] Al menos 80% de P1 cerrados o explícitamente diferidos con justificación.
- [ ] CI verde + coverage gate activo y cumpliendo umbral.
- [ ] SECURITY.md actualizado al modelo real del framework.
- [ ] Documento de estabilidad API 1.0 publicado.
- [ ] Changelog/release notes alineadas con cambios reales.

---

## 6) Matriz de trazabilidad (Issue ↔ PR ↔ Evidencia)

> Completar conforme se creen issues y PRs.

| Item | Issue | PR | Evidencia (tests/coverage/doc) | Estado |
| --- | --- | --- | --- | --- |
| P0 Plugin lifecycle runtime | #32 | TBD | TBD | Open |
| P0 Router SSR-safe | #33 | TBD | TBD | Open |
| P0 Aislamiento SSR prepare | #31 | TBD | TBD | Open |
| P0 SECURITY threat model | #35 | TBD | TBD | Open |
| P0 API stability contract | #34 | TBD | TBD | Open |
| P1 Hardening attrs/event attrs | #36 | TBD | TBD | Open |
| P1 Scheduler API no-op | #37 | TBD | TBD | Open |
| P1 Coverage gate en CI | #38 | TBD | TBD | Open |
| P1 Hardening XSS residual + alineación docs/código | #39 | TBD | tests/commit.test.ts + tests/ssr.test.ts + SECURITY.md + docs/V1-0-0-EVIDENCE-LOG.md | Open |
| P1 Diff performance | #40 | TBD | TBD | Open |

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
  - #36 Hardening attrs/event attrs
  - #37 Scheduler API no-op
  - #38 Coverage gate CI
  - #39 Hardening XSS residual + alineación docs/código
  - #40 Diff performance

---

## 7) Cadencia recomendada de seguimiento

- **Diaria (15 min):** mover estado en issues + actualización rápida de matriz.
- **Semanal:** revisión de riesgo, burn-down de P0/P1, decisiones de alcance.
- **Por PR:** enlazar issue obligatoriamente y actualizar evidencia en `docs/V1-0-0-EVIDENCE-LOG.md`.

---

## 8) Convenciones de estado

- `Open` → sin trabajo iniciado
- `In Progress` → PR en curso
- `Blocked` → dependencia externa o decisión pendiente
- `Done` → merged y verificado
- `Deferred` → acordado fuera de 1.0.0 con justificación
