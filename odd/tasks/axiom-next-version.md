# Feature: axiom-next-version — release integrity, promesas enforceadas, contrato y demo

Versión siguiente del framework (1.0.0 o 0.10.0 según la decisión de numeración al cerrar WU3).
Alcance autorizado: WU1-WU4. El re-lanzamiento completo de create-axiom (issue #96, slices
S1-S7) queda planificado para la versión posterior (1.1.0); de él solo entra ahora el exit code
de instalación (WU1-T2), que es un defecto de integridad y no una feature.

## Specs

- S1. «ahora que todo está igualado y la documentación también, detalle que debería desarrollar para la siguiente versión del proyecto.»
- S2. «WU1-WU4 completas (recomendado)» — con el preview autorizado verbatim: «Orden: WU1 release guard + exit code → WU2 DOM reads/style whitelist → WU3 contrato y trazabilidad → WU4 demo.
Cada una commiteada como slice revisable en rama de feature.»
- S3. «1. opción A
2. Ok
3. todo lo del odd se debe hacer commit» (regla vigente: todo artefacto odd de esta feature se commitea).
- S4. Restricción de diseño heredada del plan de 1.0.0 (`docs/history/V1-0-0-PLAN-TRAZABILIDAD.md`, principios): «No romper invariantes del framework (`prepare -> reflow -> commit`, hot path sin lecturas DOM)» y «No publicar 1.0.0 con APIs ambiguas, inertes o sin contrato de estabilidad».

## Tasks

| ID | Spec | Trabajo | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2 | WU1.1 Guard de release notes: `scripts/validate-release-notes.ts` + job de CI en ramas de release-please que falla si una entrada del CHANGELOG del rango tiene un descendiente `Revert "<mismo subject>"`; tests con historial sintético | worker | `dd8ab70`, `49ddeef` |
| T2 | S2 | WU1.2 `create-axiom`: exit 1 y sin bloque «Ready!» cuando `bun install` falla; test de exit code (issue #96 ítem 5) | worker | `2dc584c` |
| T3 | S2 | WU1.3 Root-cause de las corridas de CI/Security que fallan sin jobs en ramas de release (`73ecf14`, `21abff7`); fix del workflow o nota documentada con evidencia | inline | `6e386ca` |
| T4 | S2, S4 | WU2.1 Extender `tests/architecture/hot-path-dom-reads.test.ts` a `src/app.ts` con allowlist explícito justificado y aserción de que los reads permitidos no se llaman por frame (C-4, M-12) | worker | `1c9c9c0` |
| T5 | S2, S4 | WU2.2 Llamar `validateStyleProps` en dev dentro de `applyStyleToElement` + test con prop maliciosa (H-9) | worker | `1b34ea3` |
| T6 | S2 | WU2.3 JSDoc con la allowlist de DOM reads de `commitHydrate` y demarcación en el test de enforcement (M-11) | worker | `f8dbfb7` |
| T7 | S2, S4 | WU3.1 Decisión S1: `data:` base64 en estilos inline SSR (soportar saneado o documentar política en SECURITY.md) | worker + verify | `fe6cfc9` |
| T8 | S2, S4 | WU3.2 Decisión S2: `resetIndexCounter` (re-exportar, eliminar o aceptar etiqueta) coherente con `validate:api` | inline | `e42a7be` |
| T9 | S2, S4 | WU3.3 Destino de los 5 exports experimental + alineación de `docs/STABILITY.md` y `validate:api` | inline | `ce42415` |
| T10 | S2, S4 | WU3.4 Refrescar `docs/history/V1-0-0-PLAN-TRAZABILIDAD.md` (columna PR en TBD, enlaces del EPIC #30, evidencia de octubre) y cerrar #30 con checklist go/no-go | inline | `2823860` |
| T11 | S2 | WU4.1 Demo: D1 padding CSS en hosts de árboles Syntax, D2 height del canvas Grid, D3 hero-titles de 26 px en filas de 20 px | worker | `653bba6` |
| T12 | S2 | WU4.2 Reactivar los 2 skips de `bind` con `select` (D5) o documentar por qué siguen saltados; decisión D4 desktop-only documentada | inline | `8141b66` |

Cada work unit (WU1..WU4) se commitea como slice revisable ≤400 líneas en la rama de feature,
con tests y docs junto al comportamiento. WU1 va primero: 1.0.0 no se publica con el mecanismo
de release sin guard.

## Log

- L1 (usuario, verbatim): «ahora que todo está igualado y la documentación también, detalle que debería desarrollar para la siguiente versión del proyecto.»
- L2 (usuario, verbatim): «vuelva a darme las opciones, creo que seleccioné mal.»
- L3 (usuario, selección verbatim tras re-preguntar): «WU1-WU4 completas (recomendado)».
- D1 (decisión): create-axiom v2 completo (#96 S1-S7) se difiere a 1.1.0 para no repetir el
  patrón merge-grande → CI-roja-en-release → revert; solo entra el exit code de install (T2).
- D2 (decisión): la numeración (1.0.0 vs 0.10.0) se decide al cerrar WU3, no al abrir la feature.
- L8 (evidencia T11, 2026-10-16): D1-D3 corregidos en `653bba6` con medidas de navegador
  before/after (los 5 roots pasan de overflow/escape a 0/0/0; sin overflow horizontal en 1440 ni
  768; capturas `fix-d1-*.png`, `fix-d2-*.png`, `fix-d3-*.png` y JSONs `t11-before/after.json` en
  `.verify-tmp/evidence/`). Hallazgo nuevo preexistente D7 (`#syntax-layout-root`, borde CSS de
  1 px en el host vs height inline del motor, delta 2) registrado en el backlog.
- L9 (decisión T12, 2026-10-16): D4 se resuelve como demo desktop-first (≥768 px) documentado en
  `demo/style.css`; D5 se resuelve manteniendo los skips con la decisión en el mensaje
  (`8141b66`).
- L4 (evidencia T3, 2026-10-16): root-cause de R2 cerrado. Las corridas `failure` sin jobs
  (`35946642479/539` sobre `73ecf14`, PR #118; `38952332592/518` sobre `21abff7`, PR #119) NO son
  fallos de tests: con token de repo devuelven 0 jobs, approvals vacíos, sin attempts y sin
  check-runs de Actions (solo Sourcery); el `ci.yml` de esos heads es byte-idéntico al de `main`
  (mismo blob `a339ba3`) y los runs de `main` sobre los mismos commits pasan. Son runs de
  `pull_request` de PRs autorados por bot que nunca arrancaron: o quedaron esperando aprobación
  (`action_required` en `fe0e1be`) o fueron invalidados al moverse/borrarse la rama de release
  (force-push de release-please o borrado), y GitHub los finaliza como `failure` sin jobs ni
  logs. Mitigación de proceso: aprobar los runs después de que la rama estabilice y leer el
  resultado real antes de mergear; el guard de T1 cubre la otra mitad del riesgo.
- L5 (decisión T7, 2026-10-16): S1 se resuelve soportando `url(data:…)` base64 de medios en
  estilos inline SSR con paridad exacta de attrs.ts (subtipos de imagen png/jpeg/jpg/gif/webp/
  bmp/ico/avif/svg+xml; audio/video cualquier subtipo; `;base64,` obligatorio). Verificación
  independiente de seguridad: pass-with-findings; los 2 findings (ReDoS cuadrático por `\s` en
  la clase payload y paridad de subtipos) quedaron corregidos y pineados con tests.
- L6 (decisión T8, 2026-10-16): S2 se resuelve eliminando `resetIndexCounter` (no-op que nunca
  estuvo en el contrato público); sus 7 usos de tests se retiraron.
- L7 (decisión T9, 2026-10-16): los 5 exports experimental (streaming SSR y createServer) se
  mantienen experimental en 1.0.0; `docs/STABILITY.md` documenta la política de promoción
  (un ciclo minor sin breaking changes + contrato documentado + tests + evidencia en release
  notes; validate:api enforcea el tagging).
