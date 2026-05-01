# Ruta B — Features Primero (Blueprint Hiper Detallado)

**Proyecto:** `axiom-framework`  
**Fecha:** 2026-04-14  
**Baseline técnico:** `v0.2.7`  
**Horizonte estimado:** 20–24 semanas (hacia `v1.0.0`)  
**Estrategia:** maximizar competitividad funcional (layout, styling, motion y ecosistema) asumiendo mayor riesgo operativo inicial.

> **Nota de actualización (2026-04-15):** se conserva el contexto histórico de la ruta, pero las rutas operativas se alinearon con el árbol híbrido actual de `src/`.

---

## 1) Propósito de esta ruta

Ruta B prioriza ampliar la superficie funcional para posicionar Axiom como alternativa moderna y expresiva en menor tiempo percibido de mercado.

Objetivo central:

$$
\text{Aumentar capacidad de construir productos complejos sin romper } \texttt{prepare \to reflow \to commit}
$$

---

## 2) Diseño no negociable (invariantes)

Aunque es una ruta agresiva en features, estas reglas NO cambian:

1. Hot path sin lecturas DOM.
2. Frontera clara entre trabajo estructural (`prepare`) y geométrico (`reflow`).
3. `commit` determinista y batcheado.
4. Toda feature nueva trae contrato y pruebas de no-regresión.

---

## 3) Diferencia estratégica frente a Ruta A

| Dimensión | Ruta A (Confiabilidad) | Ruta B (Features) |
| --- | --- | --- |
| Objetivo principal | Estabilidad productiva | Capacidad funcional rápida |
| Riesgo técnico | Bajo/Medio | Medio/Alto |
| Time-to-feature | Medio | Alto (mejor) |
| Time-to-reliability | Alto (mejor) | Medio/Bajo (peor al inicio) |
| Perfil recomendado | Adopción empresarial temprana | Tracción de producto/comunidad |

---

## 4) Estado actual y gap para Ruta B

### 4.1 Base técnica ya disponible

- Core pipeline: `src/render/prepare.ts`, `src/render/reflow.ts`, `src/render/commit.ts`
- Router SPA: `src/router.ts`
- SSR/hydration base: `src/ssr.ts` + integración en `src/app.ts`/`src/render/commit.ts`
- Forms/context/portal/scheduler: `src/features/forms.ts`, `src/features/context.ts`, `src/features/portal.ts`, `src/scheduler.ts`
- CI/security/release: `.github/workflows/*.yml`, `release-please-config.json`

### 4.2 Gaps funcionales que Ruta B ataca primero

1. Responsive de alto nivel (media queries + unidades relativas completas).
2. Layout 2D real (Grid incremental).
3. Styling robusto (`style`, tokens, temas).
4. Motion declarativa integrada con scheduler.
5. Ecosistema de adopción (testing utils, adapters, plugin hooks iniciales).

---

## 5) Decisiones diferidas incluso en Ruta B

- Server Components / arquitectura híbrida avanzada.
- Reescritura total de diff engine.
- Compilador/DSL de templates en esta etapa.

**Razón:** mantener foco en features con retorno de adopción real y riesgo controlable.

---

## 6) Arquitectura objetivo de Ruta B

### 6.1 Capas objetivo

1. **Layout++**: flex + grid + responsive constraints.
2. **Styling layer**: style props + token resolver + themes.
3. **Motion layer**: transiciones/animaciones coordinadas por scheduler.
4. **Ecosystem layer**: testing utilities + adapters + extensibilidad mínima.

### 6.2 Mapeo explícito a módulos

#### Módulos existentes impactados

- `src/render/reflow.ts` (dispatcher de estrategias de layout)
- `src/render/prepare.ts` (normalización de constraints y reglas responsive)
- `src/render/commit.ts` (aplicación segura de estilos/actualizaciones visuales)
- `src/app.ts` y `src/scheduler.ts` (orquestación temporal de motion)
- `src/index.ts` (surface de exportación)
- `tests/reflow.test.ts`, `tests/integration.test.ts`, `tests/benchmark.test.ts`

#### Módulos nuevos propuestos

- `src/render/engines/grid.ts` (layout grid incremental)
- `src/render/strategy/responsive.ts` (evaluación de breakpoints por constraints)
- `src/features/style.ts` (validación de style keys + tokens)
- `src/features/animation.ts` (estado temporal + integración con scheduler)
- `src/testing.ts` (helpers públicos para apps consumidoras)

---

## 7) Contratos de API (objetivo)

> Contratos de diseño. Confirmar naming final por ADR antes de liberar.

### 7.1 Responsive

- `layout.width|height`: aceptar número y unidades relativas.
- `layout.breakpoints`: reglas por rango de constraints.

### 7.2 Grid

- `layout.display = 'grid'`
- `gridTemplateColumns`, `gridTemplateRows`, `rowGap`, `columnGap`
- `gridRow`, `gridColumn` por child.

### 7.3 Styling

- `style` en `ElementNode` con whitelist segura.
- sistema de tokens/tema para no depender de inline style libre.

### 7.4 Motion

- transiciones declarativas acotadas por propiedad.
- integración al scheduler para preservar batching.

---

## 8) Priorización por valor (P0/P1/P2)

| Prioridad | Feature | Valor producto | Riesgo | Módulos |
| --- | --- | ---: | ---: | --- |
| P0 | Responsive API completa | Muy alto | Medio | `reflow`, `responsive`, `types`, `tests/*` |
| P0 | Grid básico utilizable | Muy alto | Alto | `grid`, `reflow`, `tests/*` |
| P0 | Style API + tokens | Alto | Medio | `style`, `commit`, `types` |
| P1 | Motion declarativa mínima | Alto | Medio/Alto | `animation`, `scheduler`, `commit` |
| P1 | Testing utils públicas | Medio/Alto | Bajo | `testing`, `index`, `docs/*` |
| P2 | Plugin/adapters iniciales | Alto | Alto | módulos ecosystem + docs |

---

## 9) Roadmap hiper detallado por fases

### Fase 1 (Semanas 1–4): Responsive Foundation

#### Objetivo F1

Resolver diseño adaptativo real sin romper determinismo del pipeline.

#### Trabajo F1

- Modelo de unidades (`px`, `%`, `vw`, `vh`) en constraints.
- Breakpoints declarativos por nodo.
- Pruebas de consistencia en anchos borde.

#### Riesgos F1

- mezclar evaluación responsive en `commit` (prohibido).

#### DoD F1

- responsive estable en escenarios canónicos + pruebas verdes.

### Fase 2 (Semanas 5–8): Grid MVP

#### Objetivo F2

Agregar layout 2D utilizable para casos reales.

#### Trabajo F2

- motor `src/render/engines/grid.ts` (subset incremental).
- integración con `src/render/reflow.ts` por estrategia (`flex`/`grid`).
- matrix de pruebas grid/flex coexistencia.

#### Riesgos F2

- complejidad algorítmica y regresión temporal.

#### DoD F2

- grid usable en demos reales + contratos de layout estables.

### Fase 3 (Semanas 9–12): Styling System

#### Objetivo F3

Evitar adopción basada en workarounds de clases externas.

#### Trabajo F3

- `style` segura con validación de keys.
- token resolver y theming base.
- guía oficial de estilo para consumidores.

#### DoD F3

- theming funcional en demos sin hacks ni side effects ocultos.

### Fase 4 (Semanas 13–16): Motion Essentials

#### Objetivo F4

Introducir motion declarativa sin sacrificar estabilidad de frames.

#### Trabajo F4

- modelo de transición por propiedad.
- coordinación estricta con scheduler.
- cancelación/fallback en actualizaciones rápidas.

#### DoD F4

- animaciones estables en escenarios con cambios concurrentes.

### Fase 5 (Semanas 17–20): Ecosistema Inicial

#### Objetivo F5

Reducir fricción de integración externa.

#### Trabajo F5

- testing utilities públicas.
- adapters iniciales según foco de adopción.
- docs de integración y troubleshooting.

#### DoD F5

- un equipo externo puede integrar sin conocimiento tribal.

### Fase 6 (Semanas 21–24): Hardening + Release

#### Objetivo F6

Cerrar deuda de confiabilidad generada por velocidad de features.

#### Trabajo F6

- campañas de regresión y performance.
- bug bash focalizado en pipeline.
- release candidate y salida `v1.0.0`.

#### DoD F6

- gates de calidad en verde + checklist de release completo.

---

## 10) Estrategia de pruebas para Ruta B

Ruta B exige aumentar pruebas al ritmo de features. Si no, la ruta colapsa.

### 10.1 Matriz mínima

1. Unit por feature nueva.
2. Integration por combinación (flex+grid, responsive+motion).
3. Contract por API pública agregada.
4. Perf/regression por cambios de layout.

### 10.2 Casos obligatorios

- Grid con auto-placement y spans básicos.
- Breakpoints en fronteras exactas.
- Animaciones interrumpidas por nuevas actualizaciones.
- SSR/hydration coexistiendo con style API.

---

## 11) Impacto en CI/CD y versionado

### 11.1 Quality gates

- conservar gates existentes (`typecheck`, `test`, `build`, security).
- agregar suites por capability para evitar regresión silenciosa.

### 11.2 Release discipline

- mantener estrategia pre-1.0 de `release-please`.
- release notes por capability + notas de migración temprana.
- prohibido acumular cambios incompatibles no documentados.

---

## 12) Métricas de éxito

### 12.1 Producto

- menor tiempo para construir UI compleja.
- mayor expresividad en demos y casos reales.

### 12.2 Ingeniería

- regresión por release bajo control.
- performance dentro de presupuesto definido.

### 12.3 Adopción

- integraciones externas reproducibles.
- onboarding técnico con menor fricción.

---

## 13) Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
| --- | ---: | ---: | --- |
| Explosión de complejidad en `reflow` | Alta | Alta | separar estrategias por módulo + contract tests |
| Regresión de performance por grid/motion | Media/Alta | Alta | baselines por fase + feature flags |
| API inestable por velocidad | Alta | Media/Alta | ADRs cortas + gobernanza de surface |
| deuda de documentación | Media | Media | docs como entregable de fase |

---

## 14) Rollback strategy de Ruta B

1. Feature flag por capability mayor (`responsive`, `grid`, `motion`).
2. Rollback parcial por módulo antes de rollback total.
3. Protocolo de incidente: bug crítico = freeze de features + hotfix.

---

## 15) Anti-patrones en Ruta B

1. Implementar Grid completo de una sola vez.
2. Evaluar breakpoints en `commit`.
3. Introducir animaciones con timers ad hoc fuera de scheduler.
4. Publicar API nueva sin tests de contrato.
5. Mezclar tokens/styles con resolución opaca no documentada.

---

## 16) Definición de Done por fase

Cada fase termina solo si:

- feature implementada;
- pruebas (unit/integration/contract) en verde;
- documentación de uso y límites actualizada;
- no-regresión relevante en performance.

---

## 17) Checklist operativo

### 17.1 Inicio de fase

- [ ] ADR breve de feature
- [ ] contrato API definido
- [ ] matriz de pruebas acordada

### 17.2 Implementación

- [ ] feature flag temporal cuando aplique
- [ ] pruebas junto al desarrollo
- [ ] documentación en paralelo

### 17.3 Cierre de fase

- [ ] CI verde completo
- [ ] benchmark actualizado
- [ ] notas de release por capability

---

## 18) Conflictos con estado actual y resolución

1. **Conflicto:** velocidad de features puede ocultar deuda de hidratación.  
   **Resolución:** fase final de hardening obligatoria.

2. **Conflicto:** expansión rápida de API puede afectar claridad.  
   **Resolución:** gobernanza fuerte de contratos + docs.

3. **Conflicto:** presión de roadmap puede degradar performance.  
   **Resolución:** presupuestos por escenario + gates de regresión.

---

## 19) Cuándo elegir Ruta B

Elegir Ruta B si el objetivo estratégico es:

- elevar rápidamente capacidad visible,
- competir en escenarios de UI compleja,
- aceptar una fase de estabilización más intensa al final.

Si la prioridad es adopción enterprise temprana, Ruta A sigue siendo opción más segura.

---

## 20) Cierre

Ruta B es una apuesta de aceleración funcional.  
Puede posicionar Axiom más rápido en capacidad visible, pero exige disciplina estricta de pruebas, documentación y rollback para no comprometer el núcleo.
