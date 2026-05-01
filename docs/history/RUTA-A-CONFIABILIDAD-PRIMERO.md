# Ruta A — Confiabilidad Primero (Blueprint Hiper Detallado)

**Proyecto:** `axiom-framework`  
**Fecha:** 2026-04-14  
**Baseline técnico:** `v0.2.7`  
**Horizonte recomendado:** 12 semanas (hasta `v1.0.0`)  
**Estrategia:** priorizar estabilidad, verificabilidad y contratos operativos antes de expandir superficie de features.

> **Nota de actualización (2026-04-15):** se mantiene el contexto histórico de la ruta, pero las rutas operativas se actualizaron al árbol híbrido actual de `src/`.

---

## 1) Propósito de esta ruta

Este documento define una ruta de ejecución para llevar Axiom desde un estado **beta funcional** a un estado **production-ready** sin romper su axioma central:

$$
\texttt{prepare} \rightarrow \texttt{reflow} \rightarrow \texttt{commit}
$$

con las siguientes garantías:

1. **Corrección funcional verificable** (tests y contratos de comportamiento).
2. **Confiabilidad operativa** (CI/CD, regresión, rollback).
3. **Predictibilidad de performance** (métricas y límites explícitos).
4. **DX sólida** (errores accionables, documentación usable por terceros).

---

## 2) Diseño no negociable (invariantes de arquitectura)

Estas reglas NO se negocian en Ruta A:

1. **No lecturas de DOM en hot path** (`reflow` y núcleo de `commit`).
2. **`prepare` conserva su rol de trabajo costoso** dependiente de estructura/datos.
3. **`reflow` conserva su rol aritmético** dependiente de constraints y estado preparado.
4. **`commit` aplica escritura batcheada** con orden determinista (removes → updates → inserts).
5. **Sin features “bonitas” que comprometan determinismo** (animaciones complejas, grid avanzado, plugin pipeline profundo) antes de cerrar confiabilidad.

---

## 3) Estado actual verificado (v0.2.7)

### 3.1 Capacidades disponibles

- Reactividad: `src/reactivity/signals.ts`
- Composición/Componentes: `src/render/component.ts`
- Orquestación app y DX base: `src/app.ts`
- Pipeline render: `src/render/prepare.ts`, `src/render/reflow.ts`, `src/render/commit.ts`
- Diffing: `src/render/diff.ts`
- Layout flex/fast path: `src/render/engines/flex.ts`, `src/render/engines/fast-path.ts`
- Router SPA: `src/router.ts`
- SSR/Hydration base: `src/ssr.ts`, integración en `src/app.ts`/`src/render/commit.ts`
- Forms y validación: `src/features/forms.ts`
- Context/store: `src/features/context.ts`
- Portales: `src/features/portal.ts`
- Scheduler: `src/scheduler.ts`

### 3.2 Evidencia de calidad operativa

- CI: `.github/workflows/ci.yml` (typecheck + tests + build)
- Seguridad: `.github/workflows/security.yml` (audit + CodeQL)
- Versionado pre-1.0: `release-please-config.json`
- Tests: `tests/*.test.ts` (suite actual pasando)

### 3.3 Brechas críticas para producción

1. Hidratación robusta (mismatch handling + cobertura dedicada).
2. Contratos de error más diagnósticos (contexto de componente/fase).
3. Documentación de soporte y límites (runtime/browser matrix, troubleshooting).
4. Métricas estables de performance y regresión en CI.

---

## 4) Decisiones diferidas (explícitas)

**Diferidas fuera de Ruta A** por riesgo/retorno en esta fase:

- Grid layout completo.
- Sistema de animaciones avanzado.
- Sistema extensible de plugins transversal.
- CSS-in-JS nativo.
- A11y/i18n de gran alcance.

**Motivo:** estas líneas aumentan superficie y complejidad antes de cerrar confiabilidad base.

---

## 5) Arquitectura objetivo al finalizar Ruta A

### 5.1 Mapa de capas

1. **Core determinista**: `signals`, `prepare`, `reflow`, `commit`, `diff`, `scheduler`.
2. **Delivery layer confiable**: `router`, `ssr`, `hydration`.
3. **Developer ergonomics**: errores, profiling, guía de uso.
4. **Quality gates automáticos**: CI + security + regresión + cobertura.
5. **Release discipline**: changelog consistente y política de compatibilidad.

### 5.2 Contratos de API (objetivo de cierre)

> Contratos de alto nivel; mantener compatibilidad backward en `0.2.x`/`1.0.0`.

- `createApp(..., { hydrate })`: hidratación con fallback controlado y señalización de mismatch.
- `app.getMetrics()`: métricas estables y comparables entre releases.
- `renderToString(...)`: contrato SSR documentado (meta, styles, body contract).
- Router: contrato de parse y navegación con reglas de seguridad explícitas.
- Forms/context: contratos de lifecycle y cleanup documentados.

---

## 6) Priorización de trabajo (P0/P1/P2)

| Prioridad | Ítem | Impacto | Riesgo | Módulos |
| --- | --- | ---: | ---: | --- |
| P0 | Hardening de hidratación + tests | Muy alto | Medio | `src/render/commit.ts`, `src/app.ts`, `src/ssr.ts`, `tests/ssr.test.ts`, `tests/integration.test.ts` |
| P0 | Errores de runtime con contexto | Alto | Bajo/Medio | `src/app.ts`, `src/render/component.ts`, `tests/app.test.ts` |
| P0 | Baseline de perf + regresión | Alto | Bajo | `tests/benchmark.test.ts`, scripts/perf |
| P1 | Documentación de soporte y troubleshooting | Alto | Bajo | `README.md`, `docs/*` |
| P1 | Utilidades de testing públicas mínimas | Medio/Alto | Bajo | `src/index.ts`, nuevo `src/testing.ts`, `tests/*` |
| P2 | Pulido DX/devtools incremental | Medio | Medio | `src/app.ts`, demo |

---

## 7) Plan de ejecución por semanas

### Semana 1–2 (Bloque P0-A: hidratación verificable)

#### Objetivo W1-W2

Reducir riesgo de SSR/hydration a estado controlado y medible.

#### Entregables W1-W2

- Matriz de casos de hidratación (happy path + mismatch classes).
- Tests nuevos dedicados:
  - SSR HTML + hydrate + interacción consistente.
  - Reconciliación sin recreación innecesaria.
  - Fallback seguro en desalineación.

#### Diseño técnico W1-W2

- `commitHydrate` debe reportar discrepancias por categoría (attrs/text/node-shape).
- Fallback **local** (subárbol) antes de fallback global cuando sea posible.
- Mantener idempotencia de listeners y cleanup.

#### Criterios de aceptación W1-W2

- No degradación de suite existente.
- Casos críticos de hidratación cubiertos y estables.

### Semana 3–4 (Bloque P0-B: errores y observabilidad mínima)

#### Objetivo W3-W4

Convertir errores opacos en errores accionables.

#### Entregables W3-W4

- Error envelope con:
  - Fase (`prepare`/`reflow`/`commit`/`hydrate`)
  - Componente (displayName/key si existe)
  - Nodo/ruta interna mínima
- Guía de debugging rápida en docs.

#### Criterios de aceptación W3-W4

- Cualquier excepción de ciclo incluye contexto útil para triage.

### Semana 5–6 (Bloque P0-C: performance baseline)

#### Objetivo W5-W6

Definir límites operativos medibles y evitar regresiones silenciosas.

#### Entregables W5-W6

- Baseline de métricas (prepare/reflow/commit) por escenarios canónicos.
- Thresholds de regresión definidos (ej. no empeorar > X%).

#### Criterios de aceptación W5-W6

- Reportes repetibles en CI para escenarios controlados.

### Semana 7–8 (Bloque P1-A: documentación de producción)

#### Objetivo W7-W8

Cerrar brecha de adopción externa.

#### Entregables W7-W8

- Secciones en docs:
  - Matriz runtime/browser soportada.
  - Contratos de SSR/hydrate.
  - Limitaciones actuales y “no soportado aún”.
  - Troubleshooting por síntoma.

#### Criterios de aceptación W7-W8

- Un tercero puede ejecutar, depurar y diagnosticar sin conocimiento implícito del equipo.

### Semana 9–10 (Bloque P1-B: testing utilities públicas)

#### Objetivo W9-W10

Mejorar adopción y testabilidad de apps construidas con Axiom.

#### Entregables W9-W10

- API mínima de testing (sin romper filosofía): render/mount helpers, event dispatch helpers.
- Ejemplos oficiales.

#### Criterios de aceptación W9-W10

- Casos de prueba de usuario reproduciendo flujos de app sin hacks.

### Semana 11–12 (Bloque release)

#### Objetivo W11-W12

Cerrar `v1.0.0` con calidad de operación.

#### Entregables W11-W12

- Checklist de release aprobado.
- Changelog y compatibilidad verificados.
- Tag/release final.

---

## 8) Estrategia de pruebas (hiper detallada)

### 8.1 Capas

1. **Unit** (funcionalidad aislada): `signals`, `diff`, parse router, forms.
2. **Integration** (pipeline): `prepare→reflow→commit` y variantes hydrate.
3. **Contract** (API pública): comportamiento observable estable.
4. **Regression/perf**: thresholds y no-regresión temporal.

### 8.2 Casos obligatorios por módulo

- `src/reactivity/signals.ts`: invalidación, dependency graph, cleanup.
- `src/render/prepare.ts`: estabilidad estructural ante cambios shape/value.
- `src/render/reflow.ts`: determinismo geométrico y fast path coherente.
- `src/render/commit.ts`: orden de operaciones y listeners lifecycle.
- `src/router.ts`: parse robusto + hardening URL.
- `src/ssr.ts`: contrato HTML estable.
- `src/features/forms.ts`: validaciones sync/async/debounce.
- `src/features/context.ts`: scoping y aislamiento.
- `src/features/portal.ts`: montaje/limpieza/aislamiento.
- `src/scheduler.ts`: batching, cancelación y generación.

### 8.3 Definición de cobertura útil

No perseguir porcentaje por vanity. Cobertura útil = cubrir rutas de fallo reales, edge cases y contratos.

---

## 9) Impacto en CI/CD y release discipline

### 9.1 CI objetivo

- Mantener gate actual (`typecheck`, `test`, `build`).
- Añadir gates de regresión donde aplique (perf/hydration contractual).
- Mantener seguridad (`bun audit`, CodeQL) como requisito de merge.

### 9.2 Versionado

- Mantener `release-please` pre-1.0 como está configurado.
- Para salto a `1.0.0`: ventana de release congelada + checklist de estabilidad.

### 9.3 Rollback strategy

1. Detectar release degradada por métricas o incidentes.
2. Revertir release y publicar hotfix.
3. Post-mortem corto: causa raíz + test faltante + gate faltante.

---

## 10) Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
| --- | ---: | ---: | --- |
| Mismatch de hidratación en edge cases | Media | Alta | Contract tests + fallback por subárbol |
| Regresión de performance por fixes | Media | Alta | Baselines + thresholds + profiling |
| Crecimiento descontrolado de API | Media | Media | Contratos mínimos + revisión arquitectónica |
| Sobre-ingeniería de tooling | Baja/Media | Media | Mantener alcance de Ruta A (confiabilidad primero) |

---

## 11) Anti-patrones (prohibidos en Ruta A)

1. Introducir features mayores sin prueba contractual.
2. “Fix rápido” que mezcla `prepare` y `reflow` sin frontera clara.
3. Ocultar fallback global silencioso sin diagnóstico.
4. Incrementar API pública sin ADR corta.
5. Cambiar comportamiento core sin actualizar pruebas y docs.

---

## 12) Definición de Done por fase

Un bloque se considera **Done** solo si cumple todos:

- Código implementado.
- Tests nuevos y existentes pasando.
- Documentación actualizada.
- Riesgos clave mitigados o explícitamente aceptados.
- Checklist operativo firmado.

---

## 13) Checklist operativo (ejecución)

### 13.1 Antes de tocar código

- [ ] Confirmar alcance del bloque (P0/P1/P2)
- [ ] Identificar contratos impactados
- [ ] Definir test de aceptación primero

### 13.2 Durante implementación

- [ ] Mantener separación de fases `prepare/reflow/commit`
- [ ] Añadir evidencia de no-regresión
- [ ] Evitar expansión innecesaria de API

### 13.3 Antes de merge

- [ ] CI verde completo
- [ ] Tests de contrato/hydration/perf verdes
- [ ] Docs sincronizadas

### 13.4 Antes de release

- [ ] Changelog validado
- [ ] Compatibilidad y notas de migración
- [ ] Plan de rollback listo

---

## 14) Conflictos potenciales con estado actual y resolución

1. **Conflicto:** asumir hidratación “resuelta” por estar cableada.  
   **Resolución:** ruta exige validación contractual, no suposición.

2. **Conflicto:** confundir tests verdes con readiness productivo total.  
   **Resolución:** agregar pruebas específicas de riesgo (hydrate/perf/diagnóstico).

3. **Conflicto:** añadir features de marketing antes de cerrar reliability.  
   **Resolución:** gobernanza por prioridad P0/P1.

---

## 15) Métricas de éxito de Ruta A

- Incidentes críticos post-release: tendencia a cero.
- Disminución de tiempo de diagnóstico en fallos reportados.
- Estabilidad de performance en escenarios canónicos.
- Integraciones externas con menor fricción de adopción.

---

## 16) Cierre

Ruta A no busca “más features”, busca **más certeza**.  
Al cerrar esta ruta, Axiom llega a `v1.0.0` con base técnica y operativa robusta para crecer luego sin deuda explosiva.
