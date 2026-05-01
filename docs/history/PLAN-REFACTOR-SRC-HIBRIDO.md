# Plan de Refactorización de `src` — Opción Híbrida Detallada

**Proyecto:** `axiom-framework`  
**Fecha:** 2026-04-15  
**Baseline técnico:** `v0.2.8`  
**Estado del producto:** pre-`0.3.0`  
**Estrategia elegida:** refactor estructural híbrido, controlado, de bajo riesgo conceptual y alto impacto en mantenibilidad.

---

## 1) Propósito del plan

Este documento define un plan completo para reorganizar la carpeta `src/` de Axiom usando la **mejor opción de refactorización identificada**: una estructura híbrida que separa núcleo, reactividad, pipeline de render y features, manteniendo una fachada pública clara.

Objetivo central:

$$
\text{Mejorar mantenibilidad, claridad arquitectónica y capacidad de evolución sin cambiar el comportamiento público del framework.}
$$

Este plan asume que, dado que Axiom aún está en `0.2.x`, **no es obligatorio optimizar por compatibilidad estructural interna** como si ya estuviéramos en `1.0`. Por lo tanto, la ejecución puede hacerse como una **reorganización fuerte en una rama dedicada**, en lugar de una migración incremental larga.

---

## 2) Decisión arquitectónica

### 2.1 Opción elegida

Se adopta una estructura **híbrida** con esta separación principal:

- `core/` → fundamentos y tipos base
- `reactivity/` → primitives reactivas
- `render/` → pipeline determinista (`prepare -> reflow -> diff -> commit`)
- `features/` → capacidades optativas o complementarias
- raíz de `src/` → orquestación, fachada pública y puntos de entrada principales

### 2.2 Por qué esta opción es la mejor

Porque resuelve el problema REAL del repositorio actual sin sobrediseñar:

1. La carpeta `src/` hoy mezcla motor y addons al mismo nivel.
2. `app.ts` concentra demasiadas responsabilidades.
3. `prepare.ts` filtra internals hacia otros módulos y tests.
4. El proyecto aún no necesita una arquitectura por dominios completa.
5. El repo ya tiene una fachada pública utilizable en `src/index.ts`.

### 2.3 Por qué NO elegir una arquitectura más agresiva

#### Opción descartada: reorganización total por dominios

Ejemplo: `runtime/`, `routing/`, `styling/`, `forms/`, `extensions/`, etc.

**Razón de descarte:** todavía sería prematura. Hoy aumentaría complejidad conceptual, churn y esfuerzo de revisión sin mejorar proporcionalmente la mantenibilidad.

#### Opción descartada: capas técnicas demasiado rígidas

Ejemplo: `foundation/`, `pipeline/`, `orchestration/`, `addons/`.

**Razón de descarte:** aclara el pipeline, sí, pero no da una separación tan útil para evolución futura como la híbrida.

---

## 3) Problemas actuales que el plan corrige

### 3.1 Mezcla de responsabilidades en la raíz de `src/`

Hoy conviven al mismo nivel:

- motor (`prepare.ts`, `reflow.ts`, `commit.ts`)
- orquestación (`app.ts`)
- extensiones (`portal.ts`, `plugin.ts`, `forms.ts`, `context.ts`, `style.ts`, `animation.ts`)
- API pública (`index.ts`)

**Impacto:** cuesta distinguir qué es fundacional, qué es pipeline y qué es feature.

### 3.2 `app.ts` como módulo demasiado cargado

`app.ts` concentra:

- ciclo de render
- hydrate / mount / unmount
- perfilado
- dev hook
- hot reload recovery
- error reporting
- coordinación entre `prepare`, `reflow`, `diff`, `commit`

**Impacto:** módulo frágil para escalar y revisar.

### 3.3 Fuga de internals desde `prepare.ts`

`prepare.ts` exporta helpers de inspección y acceso que ya son consumidos desde varios lugares.

**Impacto:** reorganizar el pipeline hoy es más difícil porque los detalles internos ya se volvieron semipúblicos dentro del repo.

### 3.4 Tests demasiado cerca de detalles internos

Parte de la suite importa helpers como:

- `resetScheduler`
- `resetIndexCounter`
- `getNodeType`
- otras utilidades internas

**Impacto:** los tests dificultan cambios estructurales porque verifican implementación, no solo comportamiento.

---

## 4) Objetivos del refactor

### 4.1 Objetivos principales

1. Separar explícitamente el núcleo del motor de las features.
2. Hacer que el pipeline de render sea una unidad arquitectónica reconocible.
3. Mantener `index.ts` como fachada pública estable.
4. Reducir ambigüedad al navegar el código.
5. Preparar el repo para futuras extracciones internas de `app.ts`.
6. Reducir el riesgo de que nuevas features dependan de internals del pipeline.

### 4.2 Objetivos secundarios

1. Mejorar onboarding técnico.
2. Facilitar futuras ADRs sobre runtime/render/features.
3. Hacer más evidente qué archivos pertenecen al “motor” y cuáles al “ecosistema interno”.

---

## 5) No objetivos

Este plan **NO** incluye todavía:

1. Reescribir el pipeline.
2. Cambiar contratos públicos de `index.ts`.
3. Rediseñar la API de componentes.
4. Rehacer el diff engine.
5. Dividir `app.ts` en múltiples módulos funcionales.
6. Rediseñar toda la suite de tests.
7. Cambiar semántica de SSR/hydration.

Es CRÍTICO entender esto: **primero se ordena la arquitectura física del árbol, luego se mejora la arquitectura lógica interna**.

---

## 6) Invariantes no negociables

Durante el refactor deben mantenerse estas reglas:

1. La API pública exportada desde `src/index.ts` no cambia de comportamiento.
2. El pipeline sigue siendo:

   ```text
   prepare -> reflow -> diff -> commit
   ```

3. No se introducen lecturas DOM nuevas en el hot path.
4. `ssr.ts` sigue pudiendo operar sin acoplarse artificialmente a `app.ts`.
5. Los cambios deben ser estructurales, no funcionales.
6. Si un archivo pasa a otra carpeta, su responsabilidad conceptual debe seguir siendo la misma.

---

## 7) Estructura objetivo

```text
src/
├─ core/
│  └─ types.ts
├─ reactivity/
│  └─ signals.ts
├─ render/
│  ├─ component.ts
│  ├─ prepare.ts
│  ├─ reflow.ts
│  ├─ diff.ts
│  ├─ commit.ts
│  ├─ engines/
│  │  ├─ fast-path.ts
│  │  ├─ flex.ts
│  │  └─ grid.ts
│  └─ strategy/
│     └─ responsive.ts
├─ features/
│  ├─ animation.ts
│  ├─ context.ts
│  ├─ forms.ts
│  ├─ plugin.ts
│  ├─ portal.ts
│  └─ style.ts
├─ app.ts
├─ router.ts
├─ scheduler.ts
├─ ssr.ts
├─ testing.ts
└─ index.ts
```

---

## 8) Mapeo explícito archivo actual → archivo destino

| Archivo actual | Destino propuesto | Motivo |
| --- | --- | --- |
| `src/types.ts` | `src/core/types.ts` | fundamento transversal, cero deps conceptuales |
| `src/signals.ts` | `src/reactivity/signals.ts` | runtime reactivo, separado del pipeline |
| `src/component.ts` | `src/render/component.ts` | participa del pipeline y del árbol renderizable |
| `src/prepare.ts` | `src/render/prepare.ts` | fase 1 del pipeline |
| `src/reflow.ts` | `src/render/reflow.ts` | fase 2 del pipeline |
| `src/diff.ts` | `src/render/diff.ts` | diff del árbol renderizado |
| `src/commit.ts` | `src/render/commit.ts` | fase de mutación DOM |
| `src/fast-path.ts` | `src/render/engines/fast-path.ts` | estrategia interna de layout/render |
| `src/flex.ts` | `src/render/engines/flex.ts` | motor de layout |
| `src/grid.ts` | `src/render/engines/grid.ts` | motor de layout |
| `src/responsive.ts` | `src/render/strategy/responsive.ts` | regla/estrategia de layout |
| `src/context.ts` | `src/features/context.ts` | feature optativa |
| `src/forms.ts` | `src/features/forms.ts` | feature optativa |
| `src/animation.ts` | `src/features/animation.ts` | feature optativa |
| `src/style.ts` | `src/features/style.ts` | feature optativa |
| `src/plugin.ts` | `src/features/plugin.ts` | extensibilidad |
| `src/portal.ts` | `src/features/portal.ts` | feature de rendering avanzada |
| `src/app.ts` | `src/app.ts` | orquestación principal; se mantiene visible |
| `src/router.ts` | `src/router.ts` | feature mayor / entry de alto nivel |
| `src/scheduler.ts` | `src/scheduler.ts` | infraestructura transversal |
| `src/ssr.ts` | `src/ssr.ts` | entry de entrega/render server |
| `src/testing.ts` | `src/testing.ts` | utilidad pública |
| `src/index.ts` | `src/index.ts` | fachada pública |

---

## 9) Reglas de frontera arquitectónica

### 9.1 Reglas para `core/`

- Debe contener artefactos básicos y estables.
- No debe depender de `features/`.
- Puede ser importado desde cualquier otra capa.

### 9.2 Reglas para `reactivity/`

- Contiene primitives reactivas reutilizables.
- No debe conocer detalles del DOM.
- No debe importar desde `features/`.

### 9.3 Reglas para `render/`

- Contiene el pipeline central.
- Puede depender de `core/` y `reactivity/` cuando sea estrictamente necesario.
- No debe depender de `features/`.
- Debe seguir siendo el bloque más determinista del sistema.

### 9.4 Reglas para `features/`

- Contiene capacidades optativas o de nivel superior.
- Puede usar APIs públicas internas del motor.
- No debe perforar internals de `render/` salvo por contratos explícitos.

### 9.5 Reglas para la raíz de `src/`

Solo deben vivir aquí los archivos que cumplan al menos una de estas condiciones:

1. punto de entrada principal del framework,
2. orquestación transversal,
3. fachada pública,
4. capacidad de primer orden para consumidores.

---

## 10) Política de imports

### 10.1 Regla general

Los imports deben volverse **más explícitos y más predecibles**.

### 10.2 Direcciones permitidas

Direcciones preferidas:

- `core -> nadie`
- `reactivity -> core`
- `render -> core/reactivity`
- `features -> core/reactivity/render (solo contratos permitidos)`
- `app/router/ssr/testing/index -> cualquiera según necesidad justificada`

### 10.3 Direcciones prohibidas

- `render -> features`
- `core -> render/features`
- `reactivity -> features`
- imports laterales arbitrarios solo por conveniencia

### 10.4 Regla especial

Si un módulo en `features/` necesita algo demasiado interno de `render/`, eso es una señal de diseño que debe revisarse, no un permiso automático para acoplar más.

---

## 11) Tratamiento de `app.ts`

`app.ts` NO se parte en este plan, pero se reconoce formalmente como:

- orquestador del runtime cliente,
- frontera entre reactividad y pipeline de render,
- lugar temporal de coordinación de hydration, scheduling y profiling.

### 11.1 Resultado esperado

Después del refactor, `app.ts` seguirá siendo grande, pero ya no quedará escondido dentro de una raíz plana donde compite conceptualmente con módulos menores.

### 11.2 Fase futura recomendada

En una siguiente iteración, `app.ts` debería evaluarse para separación interna en submódulos como:

- `app-runtime.ts`
- `app-errors.ts`
- `app-devtools.ts`
- `app-hydration.ts`
- `app-hot-reload.ts`

Eso NO forma parte de este plan, pero este plan prepara el terreno.

---

## 12) Tratamiento de `prepare.ts` y su fuga de internals

Este plan tampoco reescribe `prepare.ts`, pero sí ordena cómo debe pensarse.

### 12.1 Decisión

`prepare.ts` pasa a `render/prepare.ts` y permanece como parte del núcleo del pipeline.

### 12.2 Implicación

Los helpers que hoy se consumen desde tests u otros módulos seguirán existiendo temporalmente, pero quedará claro que son parte del subsistema `render`, no utilidades genéricas del proyecto.

### 12.3 Consecuencia deseada

En una fase posterior será más fácil:

- reducir exports innecesarios,
- introducir contratos internos explícitos,
- distinguir debug helpers de accessors del motor.

---

## 13) Tratamiento de tests

Como el usuario pidió un plan detallado de refactor de `src/`, este plan contempla el impacto de tests aunque no rediseña toda la suite.

### 13.1 Objetivo inmediato

Actualizar imports para reflejar la nueva estructura.

### 13.2 Objetivo de estabilización

Identificar tests demasiado pegados a internals.

### 13.3 Meta futura

Reducir dependencia de helpers internos cuando sea posible y preferir validación por comportamiento.

---

## 14) Plan de ejecución detallado

Dado el estado pre-`0.3.0`, la estrategia recomendada es **cutover estructural controlado en una rama dedicada**, no micro-migración larga.

---

### Fase 0 — Congelación de superficie y preparación

**Objetivo:** evitar mezclar refactor estructural con cambios funcionales.

#### Trabajo

1. Congelar nuevas features sobre `src/` durante la ejecución del refactor.
2. Confirmar que no haya PRs paralelos moviendo imports internos.
3. Definir rama de trabajo exclusiva para el refactor.
4. Acordar una ventana de merge corta para evitar drift.

#### Criterio de salida

- El equipo sabe que durante este trabajo no se agregan features nuevas al árbol `src/`.

---

### Fase 1 — Crear nueva topología de carpetas

**Objetivo:** declarar físicamente la nueva arquitectura.

#### Trabajo de la Fase 1

1. Crear carpetas:
   - `src/core/`
   - `src/reactivity/`
   - `src/render/`
   - `src/render/engines/`
   - `src/render/strategy/`
   - `src/features/`
2. Confirmar convención de nombres final.
3. Mantener consistencia con imports `.js` en TypeScript.

#### Resultado esperado de la Fase 1

La topología objetivo ya existe y está lista para recibir módulos.

---

### Fase 2 — Mover fundamentos (`core`, `reactivity`)

**Objetivo:** aislar primero lo más estable.

#### Trabajo de la Fase 2

1. Mover `src/types.ts` → `src/core/types.ts`
2. Mover `src/signals.ts` → `src/reactivity/signals.ts`
3. Actualizar imports en todo el repo.
4. Verificar que no aparezcan imports ambiguos o accidentales.

#### Riesgo de la Fase 2

Bajo.

#### Validación de la Fase 2

- typecheck limpio
- tests afectados compilan

---

### Fase 3 — Mover el pipeline a `render/`

**Objetivo:** encapsular el motor del framework como una unidad arquitectónica visible.

#### Trabajo de la Fase 3

1. Mover `component.ts` a `render/`
2. Mover `prepare.ts` a `render/`
3. Mover `reflow.ts` a `render/`
4. Mover `diff.ts` a `render/`
5. Mover `commit.ts` a `render/`
6. Mover motores:
   - `fast-path.ts` → `render/engines/fast-path.ts`
   - `flex.ts` → `render/engines/flex.ts`
   - `grid.ts` → `render/engines/grid.ts`
7. Mover estrategia responsive:
   - `responsive.ts` → `render/strategy/responsive.ts`
8. Actualizar imports cruzados del pipeline.
9. Corregir rutas relativas desde `app.ts`, `ssr.ts`, `index.ts` y tests.

#### Riesgo de la Fase 3

Medio. Aquí estará la mayor densidad de imports a corregir.

#### Validación de la Fase 3

- typecheck limpio
- tests del pipeline compilando
- `index.ts` exportando correctamente

---

### Fase 4 — Mover features a `features/`

**Objetivo:** dejar explícito qué es addon y qué es motor.

#### Trabajo de la Fase 4

1. Mover `animation.ts`
2. Mover `context.ts`
3. Mover `forms.ts`
4. Mover `plugin.ts`
5. Mover `portal.ts`
6. Mover `style.ts`
7. Actualizar imports desde `index.ts`, demos, tests y módulos internos.

#### Riesgo de la Fase 4

Bajo/Medio.

#### Validación de la Fase 4

- imports públicos correctos
- no aparecen dependencias ilegales desde `render`

---

### Fase 5 — Revisión de fachada pública

**Objetivo:** asegurar que la reorganización no se filtre como ruptura pública no planeada.

#### Trabajo de la Fase 5

1. Revisar `src/index.ts` completo.
2. Mantener exactamente la misma intención semántica de exportación.
3. Confirmar que `exports` de `package.json` no requieran cambios estructurales adicionales.
4. Verificar que `src/testing.ts` siga siendo accesible como surface separada.

#### Riesgo de la Fase 5

Medio, por ser la frontera pública.

#### Validación de la Fase 5

- `dist/index.d.ts` debería reflejar la misma API conceptual
- consumidores no necesitan cambiar imports públicos

---

### Fase 6 — Ajuste de tests y estabilización

**Objetivo:** absorber el impacto estructural sin mezclar rediseño de test strategy.

#### Trabajo de la Fase 6

1. Actualizar imports rotos en `tests/`.
2. Identificar tests que dependan demasiado de internals.
3. Corregir únicamente lo necesario para estabilizar la suite.
4. Registrar deuda restante de test acoplado.

#### Riesgo de la Fase 6

Medio.

#### Resultado esperado de la Fase 6

La suite vuelve a verde sin intentar reescribir su filosofía completa en esta misma fase.

---

### Fase 7 — Verificación documental y arquitectónica

**Objetivo:** consolidar la nueva estructura como estándar del repo.

#### Trabajo de la Fase 7

1. Actualizar documentación que mencione estructura vieja.
2. Documentar la nueva organización en un archivo de arquitectura o contributing si aplica.
3. Aclarar reglas de imports y fronteras para evitar recaída.

#### Resultado esperado de la Fase 7

La nueva estructura deja de ser “código movido” y pasa a ser “convención del proyecto”.

---

## 15) Estrategia de validación

Aunque este trabajo sea estructural, NO debe tratarse como si fuera gratis.

### 15.1 Validación mínima obligatoria

1. `typecheck`
2. tests unitarios y de integración relevantes
3. revisión de exports públicos
4. sanity check de demo y SSR si el flujo de trabajo lo permite

### 15.2 Validación semántica

Debe confirmarse que:

- el pipeline sigue comportándose igual,
- hydration no cambia por accidente,
- `index.ts` sigue siendo la única fachada para consumidores,
- no se introducen acoplamientos nuevos peores que los anteriores.

---

## 16) Riesgos principales

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | ---: | ---: | --- |
| Imports rotos por cambio masivo de rutas | Alta | Media | ejecutar movimiento por bloques conceptuales |
| Tests frágiles por dependencia de internals | Alta | Media/Alta | estabilizar imports primero, rediseñar después |
| Recaída a estructura plana en futuras features | Media | Alta | documentar reglas de frontera |
| Cambios funcionales accidentales durante el movimiento | Media | Alta | prohibir mezcla con features y fixes no relacionados |
| Aumento de complejidad percibida por exceso de carpetas | Baja | Media | mantener árbol corto y semánticamente claro |

---

## 17) Anti-patrones a evitar

1. Mover archivos y “aprovechar” para refactorizar lógica interna en el mismo commit.
2. Cambiar nombres públicos solo porque “ahora suenan mejor”.
3. Permitir que `features/` empiece a depender de cualquier detalle interno de `render/`.
4. Convertir la carpeta raíz en un cajón de sastre otra vez.
5. Reorganizar tests y motor al mismo tiempo sin frontera clara de trabajo.

---

## 18) Definición de Done

Este refactor se considera terminado solo si:

1. `src/` refleja la nueva estructura objetivo.
2. La API pública sigue estable.
3. El árbol es más comprensible que antes.
4. El pipeline quedó claramente encapsulado en `render/`.
5. Las features quedaron explícitamente separadas.
6. Tests y typecheck vuelven a verde.
7. La documentación del repo deja constancia de la nueva convención.

---

## 19) Resultado esperado después del refactor

### 19.1 Mejora inmediata

- Navegación más clara del código.
- Separación visible entre motor y features.
- Mejor base para futuras decisiones arquitectónicas.

### 19.2 Mejora a mediano plazo

- Facilita extraer responsabilidades de `app.ts`.
- Facilita endurecer contratos internos del pipeline.
- Reduce riesgo de crecimiento desordenado de `src/`.

### 19.3 Mejora a largo plazo

- Prepara el proyecto para `0.3.x` y luego `1.0.0` con una estructura más sostenible.
- Permite que futuras features entren en sitios previsibles.
- Disminuye el costo cognitivo de contribuir al framework.

---

## 20) Siguiente documento recomendado

Una vez aprobado este plan, el siguiente artefacto útil sería uno de estos:

1. **ADR del refactor** — decisión corta y formal.
2. **Checklist ejecutable de implementación** — orden exacto de cambios por archivo.
3. **Guía de fronteras/imports** — norma del proyecto para evitar recaídas.

---

## 21) Cierre

Axiom todavía está en una etapa donde puede permitirse una corrección estructural importante sin cargar con el peso de compatibilidad que tendría un proyecto maduro. Esa ventana no es eterna.

Por eso la decisión correcta NO es “esperar a que el árbol duela más”, sino **ordenar `src/` ahora con una estructura lo bastante clara para durar, pero lo bastante pragmática para no convertirse en sobrearquitectura**.

La opción híbrida es la mejor precisamente por eso: **impone orden donde hoy hay mezcla, sin fingir que el proyecto ya necesita una taxonomía empresarial completa**.
