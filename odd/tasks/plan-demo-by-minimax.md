# Plan: demo de Axiom — cerrar la distancia entre lo que el demo afirma y lo que demuestra

> **Origen**: revisión funcional completa del demo desplegado sobre `main` (18 secciones del demo
> interactivo, más el launcher, `/ssr` y `/ssr-stream`), con ego-browser, y contraste posterior con
> un análisis arquitectónico y de producto independiente.
>
> **Alcance**: el demo (`demo/`) y su cobertura (CI, tests, contratos). **No se toca `src/`** salvo
> donde un ítem lo exija explícitamente y se declare por separado (§4.1).
>
> **Estado**: plan. Sin implementación. `main` de referencia: `e607b06` (PR #135, demo-responsive).
> Versión publicada: `1.0.1`.

---

## 1. Por qué este plan

El demo es la **única cara pública** del repositorio para quien no instala el paquete: `package.json`
publica `files: [dist, src, scripts/create-axiom.ts, scripts/templates, README.md, LICENSE, CHANGELOG.md]`.
`demo/` no llega a npm, luego no es un experimento interno: es el escaparate.

Y en ese escaparate hay una distancia entre lo que el demo **afirma** y lo que **demuestra**. Ese
es el objeto de este plan: cerrar la distancia. No se trata de añadir efectos ni features, sino de
que cada afirmación del demo sea verificable y de que el pipeline que lo produce esté cubierto.

Tres distancias concretas, medidas:

1. **La métrica que sostiene la tesis central es texto fijo.** `demo/static.html:374` contiene
   `<span class="metric-badge">0 DOM reads en hot path</span>`. El invariante sí está medido en el
   repo (`tests/architecture/app-steady-state-dom-reads.test.ts`, por intercepción de
   `window.innerWidth/clientWidth/...`), pero el demo, que es donde se convence al evaluador, lo
   afirma.
2. **El pipeline del demo no está en CI.** `grep demo .github/workflows/*.yml` → 0 referencias. CI
   solo tiene los jobs `test` y `release-notes`. `tsc --noEmit` sí cubre `demo/**/*.ts`
   (`tsconfig.json:43`), así que los errores de tipo se atrapan; pero el bundle y la generación del
   sitio estático (`demo/build.ts`) no los ejecuta nadie automáticamente.
3. **La cobertura del demo es de inspección de fuente, no de comportamiento.** La convención del
   repo (`tests/demo-sidebar-sections.test.ts`) es `expect(source).not.toContain("h('br'")`. Es un
   oráculo débil: renombrar una regla CSS rompe el test, y una regresión de comportamiento que
   conserve el texto lo deja pasar. El contraste con el S4 (oráculo fuerte, por intercepción) es el
   norte.

Además hay dos fricciones estructurales que el demo expone y que conviene convertir en contrato
explícito:

4. **El motor es dueño de la geometría, y el consumidor tiene que reconciliarse a mano.** El motor
   escribe anchos y altos en píxeles fijos (`commit.ts`: `root.style.height = layout.height[rootIdx]`)
   y nunca encoge al contenedor. F1 (corregido en PR #135) fue exactamente eso: el canvas se
   desbordaba y su excedente quedaba inalcanzable; el arreglo fue que el **demo** midiera el
   espacio disponible con `getComputedStyle` + `clientWidth` y ajustara el ancho él mismo. Ese
   trabajo pertenece a una regla, no a un fichero suelto.
5. **El demo reimplementa el framework en DOM plano.** El patrón «botón HTML estático +
   `addEventListener` + `<pre>` de salida» se repite unas diez veces (`ruta-b-showcase.ts` ×4,
   `syntax-showcase.ts` ×5, más dx, context, forms, router). No es un tema de gusto: es la causa
   directa de F2, donde `cellCount` (signal) y `updateStatus()` (escritura manual) divergieron y
   dejaron un botón inerte con estado 6/6.

---

## 2. Objetivos y no-objetivos

### Objetivos

- **G1** Que cada afirmación técnica del demo sea una medición, no un literal.
- **G2** Que el artefacto que el repo publica como escaparate esté verificado por CI.
- **G3** Que los invariantes que importan del demo tengan oráculos de comportamiento, no de texto.
- **G4** Que la frontera «qué escribe el motor y qué escribe el consumidor» esté documentada como
  contrato, con sus escaping hatches.
- **G5** Que el demo deje de crecer como bitácora y se pueda recorrer con intención.

### No-objetivos

- **N1** No reescribir el motor ni cambiar su semántica. `src/` no se toca, salvo el dev hook
  (§4.1) y con su propia unidad de trabajo.
- **N2** No introducir dependencias de runtime. El demo no se publica, pero el repo sí publica.
  Cualquier dependencia nueva es de desarrollo y debe justificarse por escrito (§4.2, D7).
- **N3** No añadir features de producto al demo. Un showcase nuevo no es una mejora del showcase.
- **N4** No tocar la página pública de releases ni el contrato de versión, salvo el ítem D4, que es
  explícitamente una decisión de política del mantenedor.

---

## 3. Elementos de partida que ya están bien

No todo es deuda. Esto se conserva y, en algún caso, se convierte en prueba fijada:

- **El benchmark ya compara contra el golden standard.**
  `demo/syntax-showcase.ts:272` — `GOLDEN_MS = 2.228` (5000 nodos, `benchmarks/.golden.json`),
  `GOLDEN_N = 500` con escalado proporcional y presupuesto de ≤ +5%. Es la credibilidad técnica
  más valioso del demo. **No requiere trabajo**; sí conviene registrarlo en el README del demo para
  que no se lea como un número suelto.
- **El foco sobrevive a los re-renders.** Medido: el botón «Clicks: 0» conserva el foco y el mismo
  nodo DOM tras el clic (`mismoNodo: true`). Es a11y correcto y es evidencia directa de que el
  diffing reutiliza nodos en vez de recrearlos. Hoy nadie lo demuestra: conviene convertirlo en un
  test de comportamiento que lo fije (§4.3, D6).
- **El pie de métricas expone prepare / reflow / commit / TOTAL / POOL**, que es un banco de
  pruebas razonable. Le falta vivir (§4.3, D2).
- **`window.__AXIOM__` expone `version`, `mounted`, `metrics`, `profiling`.** Es la superficie de
  introspección que hace posible D1. Le falta exponer el árbol/layout calculado.
- **`validate:api` + `docs/STABILITY.md`** verifican por máquina el contrato público. Ese es el
  patrón que el demo no tiene; el objetivo es replicarlo, no inventar otro.

---

## 4. Plan de trabajo

Ocho ítems, en tres oleadas. Cada uno es una unidad revisable por separado, con su verificación.
El identificador `D#` se mantiene en las tablas de `odd/tasks/backlog-pendientes.md`.

### 4.1 Oleada 1 — Cerrar la distancia (barato, alto retorno)

#### D2 — La métrica de la tesis, en vivo

**Motivo.** G1. El demo afirma la tesis central del framework con un literal. Es la mayor
oportunidad de retorno de todo el plan: convierte el argumento diferenciador en una demostración.

**Qué.** El contador de lecturas DOM pasa a ser una medición real, con la misma técnica que el test
S4: `Object.defineProperty` sobre `window.innerWidth/innerHeight` y `clientWidth/clientHeight` para
contar accesos. Se muestra en vivo junto a las métricas por fase.

**Por qué produce una demostración y no un número.** El motor cachea las restricciones de layout y
solo las refresca en `resize` (`src/app.ts:468`). El contador debe dar **0** durante un ciclo de
actualización y **>0** al redimensionar. Esa disyuntiva es la prueba, en vivo, de la promesa.

**Riesgo.** Interceptar `window.innerWidth` afecta al propio framework: hay que interceptar de
forma que el valor devuelto sea idéntico y el contador solo observe. Probar que no altera el
comportamiento (el contador debe dar 0 en el hot path, que es justamente lo que se afirma).

**Verificación.** (a) Test de comportamiento en happy-dom: durante una actualización por signal, el
contador de lecturas es 0; tras un `resize`, es >0. (b) En navegador: el badge cambia con el
redimensionado y vuelve a 0 al interactuar.

**Alcance.** `demo/controls.ts`, `demo/static.html`, un test nuevo. No toca `src/`.

**Acoplado.** D2 expone la métrica; D1 la explica. Ver D1.

**Corolario (mismo ítem).** `m-fps` cuenta **ciclos de actualización del framework por segundo**, no
frames del navegador (`demo/controls.ts:37`, `frameCount++` dentro de `updateMetrics`, disparado
por `requestAnimationFrame` tras cada interacción). En la revisión se observó `—` en reposo y el
texto sin cambiar en 400 ms: es un snapshot que se refresca al interactuar. Renombrar la etiqueta a
«ciclos/s» y actualizarla en vivo mientras el slider se arrastra, para que la métrica diga lo que
mide.

---

#### D3 — El demo entra en CI

**Motivo.** G2. El demo es el escaparate y su pipeline no lo ejecuta nadie. Es el mismo patrón que
justificó el dispatch explícito del guard de release-notes: un flujo que debe correr aunque nadie
lo disponga a mano.

**Qué.** Un job nuevo en `.github/workflows/ci.yml` que ejecute `bun run demo:build` (bundle de
`src/` + `demo/` y generación del sitio estático) y falle si el build rompe. Opcionalmente, un
smoke test de las tres rutas (`/`, `/static.html`, `/ssr`).

**Riesgo.** Bajo: es un job que hoy no existe. El riesgo real es que **entre en rojo por un motivo
ajeno** (por ejemplo, el bundle depende de una versión de Bun distinta). Se acota fijando
`bun-version` como en el job `test`.

**Verificación.** (a) El job pasa en verde sobre `main`. (b) Un cambio que rompa el bundle del demo
lo pone en rojo (se prueba en un PR de prueba, como se hizo con el guard de release-notes).

**Alcance.** `.github/workflows/ci.yml`.

**Dependencia de versión.** Un job de CI no es un cambio de demo: se commitea como `ci(...)`, que
también es sección oculta en el changelog (§4.6). No avanza la versión.

---

#### D3b — La regla de versión, verificada por máquina

**Motivo.** La regla que se fijó en esta sesión («una corrección que no toca el framework no puede
avanzar la versión») depende hoy de una convención externa: que `chore` sea sección oculta en el
preset de changelog de release-please 17.6.0. Verificado en el código de la herramienta y en
producción (`✔ No user facing commits found since 2869bbf - skipping`), pero **sin red de seguridad**:
una actualización de release-please, o un `changelog-sections` explícito en la config, lo cambiaría
en silencio.

**Qué.** Un guard con la forma del guard que ya existe (`scripts/validate-release-notes.ts` +
job en CI) que verifique, sobre el rango de commits de la PR, que ningún commit que no toque `src/`
lleve un tipo que avance la versión (`fix`, `feat`, o un `Release-As`).

**Nota de criterio.** El criterio correcto **no es «demo»**, es **«no toca `src/`»**. `docs/`,
`tests/`, `scripts/` y `demo/` caen en la misma categoría. Hoy la regla está escrita como
`chore(demo):` porque los cambios eran de demo: es correcto por casualidad, no por regla.

**Verificación.** (a) Un commit de prueba `fix(demo):` sobre un PR que no toca `src/` pone el guard
en rojo. (b) Un commit `feat(src):` pasa. (c) Un commit `chore(demo):` pasa.

**Riesgo.** Es una política del repo, no un bug: **requiere decisión del mantenedor** (§5, D-a).

**Alcance.** `scripts/validate-*.ts`, `.github/workflows/ci.yml`. No toca `src/`.

---

### 4.2 Oleada 2 — Estructura y contrato (coste medio)

#### D1 — Playground / Inspector de tres paneles

**Motivo.** G1 y G5, y es la idea de mayor alcance del plan: no solo mostrar una cifra, sino hacer
legible el modelo mental del framework. Tres paneles: **«Cómo se escribe en Axiom» → «Qué calcula
el motor en memoria» → «Resultado visual»**.

**Prerrequisito (toca `src/`).** El panel central requiere exponer el árbol o el layout calculado.
Hoy `window.__AXIOM__` expone `version`, `mounted`, `metrics`, `profiling`: no el árbol preparado.
Ampliar el dev hook **es un cambio de desarrollo** y, por la regla vigente (§4.6), avanza la versión
en su propia unidad de trabajo, separada del resto del ítem.

**Qué.** (a) Ampliación del dev hook para exponer el árbol preparado / el layout, en modo
desarrollo. (b) Un panel en el demo que muestre: el código fuente del componente, el layout
calculado en memoria (posiciones, tamaños, línea base) y el resultado.

**Riesgo.** Medio-alto. Ampliar el dev hook toca la superficie pública de `src/`, con su propio
presupuesto de revisión. El panel es la parte grande y opcional: puede entregarse el dev hook sin
el panel, o al revés.

**Verificación.** (a) Test que comprueba que el dev hook expone lo prometido y que no lo expone en
modo producción. (b) En navegador: el panel central muestra un layout coherente con el resultado
visual (las coordenadas del panel coinciden con las del DOM renderizado).

**Alcance.** `src/app.ts` (dev hook) + `demo/` (panel) + tests. **Dos unidades de trabajo**: una de
`src/` (versionada) y una de demo (no versionada).

---

#### D6 — Dogfooding total: el demo usa el framework para mostrar el framework

**Motivo.** G3 y elimination de una familia de bugs. El patrón «señal + sincronización manual del
DOM» aparece unas diez veces y ya produjo un defecto real (F2). No es una cuestión estética: es
la razón por la que el demo puede divergir de lo que el framework haría.

**Qué.** (a) Las salidas del demo que hoy se escriben a mano (`updateStatus()`, `outputEl.textContent
= ...`) pasan a usar `bind()` y los helpers del framework. (b) Un helper único de cableado para los
controles externos (`wireShowcase(root, { controls, outputs })`), que sustituye al patrón repetido
en `ruta-b-showcase.ts` (×4), `syntax-showcase.ts` (×5), `dx-showcase.ts`, `context-demo.ts`,
`forms-demo.ts` y `router-demo.ts`. (c) Un test de comportamiento que fije que el grid no excede su
tope y que el estado del DOM coincide con el estado de la señal.

**Nota.** Los controles del demo son HTML estático **fuera** del árbol de Axiom, y el propio código
lo documenta: `addEventListener` es el escape hatch correcto ahí. La migración es de las **salidas**
y del cableado, no de la estructura de controles.

**Riesgo.** Medio: toca muchos ficheros del demo. Es el ítem con mayor superficie de revisión del
plan, y el que más se benefaría de ir por showcased en grupos pequeños.

**Verificación.** (a) Suite completa verde. (b) Tests de comportamiento para los invariantes que
hoy solo se comprueban por texto. (c) En navegador: las 18 secciones siguen respondiendo (el
barrido automatizado de la revisión sirve de red).

**Alcance.** `demo/*.ts`, `tests/demo-*.test.ts`. No toca `src/`.

---

#### D8 — Contrato de propiedad del layout

**Motivo.** G4. El motor escribe geometría en píxeles fijos y el consumidor debe reconciliarse con
el contenedor (F1 fue una instancia). El repo necesita una regla explícita de qué delega el motor y
qué delega al CSS, con sus escaping hatches.

**Qué.** Un documento de contrato (ubicación a decidir: `docs/` si es público, `odd/tasks/` si es
interno) que fije: qué propiedades escribe el motor y con qué precedencia, qué puede escribir el
consumidor, qué escapas es válidas (`.btn-toggle` con `!important`, `removeAttribute('style')`), y
qué se hace cuando el contenedor es más pequeño que la geometría que el motor escribió.

**Qué NO es.** No es un rediseño del motor ni un cambio de semántica. Es documentación, más —si
aparece en el camino— un helper compartido que remplace al ajuste manual de F1.

**Verificación.** El contrato se acepta si un consumidor nuevo puede seguirlo sin leer el código
del motor, y si el caso «contenedor más pequeño que la geometría» tiene una respuesta escrita y
probada.

**Alcance.** Un documento + opcionalmente un helper en `demo/`.

---

### 4.3 Oleada 3 — Reestructuración (coste alto)

#### D5 — De «mega-sidebar» a vistas modulares

**Motivo.** G5. El sidebar son 18 secciones en 340px de ancho y 6652px de scroll; a 1280px solo se
ven ~900px, así que llegar a «Forms» cuesta unas siete pantallas. No hay índice, ni scrollspy, ni
resaltado de sección activa. La columna principal, con 940px, aloja el canvas masonry: la
importancia y el espacio están invertidos.

**Qué.** Cuatro vistas según la taxonomía:

1. **Core & Layout Engine** — canvas masonry, sliders de estrés, métricas en vivo.
2. **Syntax & Reactivity** — JSX vs `h()` vs Literal, control de flujo, layout DSL, eventos.
3. **Application Layer** — router (incluido lazy), forms y validación, context y stores.
4. **DX & Runtime** — profiling, dev hook, error envelope, portals, plugins.

Cada vista con su propia navegación breve. La vista por defecto debe ser la 1: hoy el primer
contacto del visitante es un sidebar de 18 controles, no la tesis del framework.

**Consecuencia de diseño.** La separación debe ser de **vista**, no de página: el demo debe seguir
siendo una sola URL y abrirse como fichero local, que es una de sus propiedades (`launcher.js`
deshabilita el enlace SSR bajo `file://`). La navegación entre vistas puede ser por estado en
signal, que además es la forma de dogfooding que D6 propone.

**Riesgo.** Alto: es la reescritura de la página del demo y el que más riesgo de revisión tiene.
Mitigación: por vistas, en PR separados, manteniendo el enlace profundo por ancla para que las
referencias externas sigan funcionando.

**Verificación.** (a) Las 18 secciones siguen presentes y respondiendo (barrido automatizado).
(b) Cada vista es alcanzable en un clic desde el arranque. (c) El demo sigue abriéndose como
fichero local.

**Alcance.** `demo/static.html`, `demo/app.ts`, `demo/style.css`, `demo/*.ts`. No toca `src/`.

---

#### D7 — Demostrador comparativo

**Motivo.** G1: cerrar el argumento técnico con una medición lado a lado, no con una afirmación.

**Qué.** Un botón que ejecuta la misma carga de trabajo —500 tarjetas reposicionándose— en dos
implementaciones y compara: lecturas al DOM, reflows, tiempo de commit y ciclos/s. La comparación
honesta es contra **re-render DOM sin diff** (la alternativa ingenua), no contra un VDOM maduro:
compararse contra Preact o React en la misma página es una comparación que se puede acusar de poco
generosa, y añade una dependencia de desarrollo al repo.

**Decisión previa.** (a) ¿Se admite una dependencia de desarrollo (VDOM) o se limita a DOM nativo?
(b) ¿La comparación vive en el demo o en `benchmarks/`? La segunda opción es más honesta (el demo
muestra, el benchmark mide) y no altera el escaparate.

**Riesgo.** Medio. El riesgo mayor no es técnico sino de perception: un comparativo puede leerse
como PUBLICidad si el caso base está chosen a la baja. Conviene que la methodology (caso base,
métrica, número de repeticiones) esté visible junto al número.

**Verificación.** (a) El comparativo corre en CI o en `benchmarks/` con salida reproducible.
(b) La cifra del demo y la del benchmark coinciden.

**Alcance.** `demo/` o `benchmarks/`, según la decisión.

---

### 4.4 Ítems de apoyo

| ID | Qué | Motivo | Coste |
|---|---|---|---|
| D9 | Convertir el `/ssr-stream` en API honesta: documentar que emite un único chunk, o marcarlo `@experimental` con esa advertencia visible | `src/ssr-stream.ts:22` — la API pública emite un chunk único; el demo lo admite, pero el análisis del producto lo pasó por alto | bajo |
| D10 | Fijar con un test de comportamiento que el foco y el nodo DOM sobreviven a un re-render | Es una fortaleza real y verificada, hoy sin test | bajo |
| D11 | Tests de comportamiento para los invariantes del demo (el grid no excede su tope; el canvas cabe en su host) en lugar de inspección de fuente | G3: los oráculos débiles pasan regresiones | medio |
| D12 | Documentar en el README del demo el benchmark contra golden (2.228 ms / 5000 nodos, escalado a 500) | Es la credibilidad más valiosa y hoy se lee como un número suelto | bajo |
| D13 | Regla de revisión: todo hallazgo se contrasta con (a) el código fuente y (b) una segunda primitiva de medición | La revisión de esta sesión produjo dos falsos positivos: «14 de 18 secciones inalcanzables» (confusión sidebar/contenido + lectura de `elementFromPoint` con scroll suave en curso) y «`err={}`» (artefacto de serializar un `Error`) | bajo |

### 4.5 Lo que este plan NO hace

- No toca el motor. La única excepción prevista es el dev hook de D1, aislado en su propia unidad.
- No arregla el motor de layout para que encaje al contenedor: documenta el contrato (D8).
- No migra los controles externos del demo al árbol de Axiom: son HTML estático por diseño y
  `addEventListener` es el escape hatch correcto ahí.
- No publica el demo en npm ni cambia el `files` de `package.json`.

### 4.6 Relación con la regla de versión

Regla vigente: **un commit que no toca `src/` no avanza la versión**. Se aplica con el tipo de
commit, no con la ruta del fichero: `chore(...)` para demo, CI, scripts y docs; `docs(...)` para
documentación. Verificado en release-please 17.6.0 (`chore` es sección oculta del preset → sin
entrada de changelog → changelog vacío → el release se omite) y en producción.

Consecuencias sobre este plan:

- **D2, D3, D5, D6, D8, D9–D13 no tocan `src/`** → se commitean como `chore(demo):` / `ci(...)` /
  `docs(...)` y no avanzan la versión.
- **D1 tiene dos mitades**: la ampliación del dev hook toca `src/` → es una unidad `feat(src):` que
  avanza la versión por su cuenta; el panel del demo es `chore(demo):` y no avanza nada.
- **D4 (el guard) no toca `src/`** → `chore(...)`.
- **D7, si se decide medir en `benchmarks/`**, no toca `src/` → `chore(...)`; si además del
  comparativo saliera una mejora del motor, esa parte sería `feat(src):` aparte.

---

## 5. Decisiones que requieren del mantenedor

| ID | Decisión | Por qué no se decide aquí |
|---|---|---|
| D-a | ¿Se adopta el guard de versión (D3b) como política del repo? | Es una política, no un bug. Afecta a cómo se comitea a partir de ahora |
| D-b | ¿El comparativo (D7) admite una dependencia de desarrollo? | Añade superficie de supply-chain a un repo que publica en npm |
| D-c | ¿El comparativo vive en el demo o en `benchmarks/`? | El demo muestra; el benchmark mide. Mezclarlos resta credibilidad a la cifra |
| D-d | ¿El contrato de layout (D8) es documento público (`docs/`) o interno (`odd/tasks/`)? | Depende de si el repo quiere exponer el modelo de propiedad del layout como parte de su propuesta |
| D-e | ¿D5 se hace antes o después de D6 (dogfooding)? | D5 reescribe la página del demo; D6 reescribe su cableado. Hacer D5 antes implica cablear dos veces |
| D-f | ¿La ampliación del dev hook (D1a) entra en la siguiente versión? | Es `src/` y por tanto avanza la versión; conviene decidir si va con el siguiente cambio de framework o si espera |

---

## 6. Estrategia de verificación

El plan no hereda el problema que ya se detectó en la revisión: **un oráculo débil pasa
regresiones**. Reglas para todos los ítems:

1. **Comportamiento, no texto, cuando el invariante sea observable.** Los invariantes del demo
   (tope del grid, encaje del canvas, foco tras re-render, lecturas DOM del hot path) se asientan
   con tests en happy-dom, como el S4, no con `expect(source).toContain(...)`.
2. **Cada afirmación nueva del demo lleva su contrapruebo.** Si el demo dice «0 lecturas DOM», el
   test que lo demuestra está al lado; si dice «ciclos/s», el número se recalcula.
3. **Todo hallazgo se contrasta con el código fuente y con una segunda primitiva de medición**
   (D13). Es lo que evitó los dos falsos positivos de esta revisión.
4. **El barrido de las 18 secciones es la red de seguridad del demo.** El script de revisión
   automatizada (ego-browser, 77 comprobaciones) debe quedar versionado y ejecutable, con sus
   artefactos en `odd/evidence/`, para que cualquier cambio del demo pueda reverificar las
   secciones en bloque.
5. **Cada ítem se verifica en navegador real**, no solo en tests. El demo es un artefacto visual:
   un test verde no dice si algo se ve bien.
6. **La suite completa y los validadores pasan antes de cada entrega**: `bun run typecheck`,
   `bun test` (coverage gate), `bun run validate:api`, `bun run validate:release-notes`.

---

## 7. Riesgos del plan

| Riesgo | Alcance | Mitigación |
|---|---|---|
| D5 reescribe la página del demo y rompe referencias externas | Enlace profundo por sección | Mantener anclas por sección y Acceptar el redirect |
| D1 amplía la superficie pública de `src/` | Revisión y versión | Unidad de trabajo separada, con su propio presupuesto |
| D6 toca muchas partes del demo a la vez | Superficie de revisión | Ir por showcased en grupos pequeños |
| D7 se percibe como publicidad | Credibilidad | Metodología visible junto al número; preferir `benchmarks/` |
| D3b se lee como rigidez en el versionado | Fricción diaria | El guard avisa, no bloquea, si el mantenedor lo prefiere |
| El plan crece sin prioridad | Repo sin foco | Cada oleada es independiente y entregable; se puede parar tras la primera |

---

## 8. Secuencia

| Oleada | Ítems | Entregable | Versión |
|---|---|---|---|
| 1 | D2, D3, D12 | El demo mide lo que dice y su build está en CI | No avanza |
| 1 | D3b (si D-a lo aprueba) | La regla de versión verificada por máquina | No avanza |
| 2 | D1a + D1b, D8, D10, D11 | El inspector existe y el contrato está escrito | D1a avanza; el resto no |
| 2 | D9, D13 | Correcciones de honestidad del demo y regla de revisión | No avanza |
| 3 | D6, D5, D7 | Demo reescrito, navegable y comparado | No avanza (salvo que D7 toque `src/`) |

Cada oleada deja el repo en un estado coherente y publicable. Ninguna depende de que la anterior
esté terminada, salvo D1b, que necesita D1a.

---

## 9. Log

- L1 (usuario, verbatim): «deme razones, motivos, sugerencias u otros puntos de vista del demo que se
  ha hecho hasta este punto».
- L2 (usuario, verbatim): «Crea un md con el plan para solucionar esos puntos que se llame
  "plan-demo-by-minimax.md". La ubicación dentro del proyecto es a criterio suyo.»
- L3 (usuario, verbatim): «OJO solo el plan, nada de implementación.»
- D-1 (decisión): el plan vive en `odd/tasks/`, junto a `demo-ui-polish.md`, que es su documento
  hermano. `docs/` queda para lo que el repo muestra al mundo; este plan es material de trabajo.
- D-2 (decisión): el criterio de versionado se escribe como «no toca `src/`» y no como «demo»,
  porque es el que refleja la regla en sí, no la operación que la nacimiento de este plan.
- D-3 (decisión): el plan no toca el motor. D1 es la única excepción prevista y queda aislada en su
  propia unidad de trabajo, con su propio efecto sobre la versión.
