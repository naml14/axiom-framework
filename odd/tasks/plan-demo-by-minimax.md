# Plan: demo de Axiom — cerrar la distancia entre lo que el demo afirma y lo que demuestra

> **Origen**: revisión funcional completa del demo desplegado sobre `main` (18 secciones del demo
> interactivo, más el launcher, `/ssr` y `/ssr-stream`), con ego-browser, y contraste posterior con
> un análisis arquitectónico y de producto independiente.
>
> **Alcance**: el demo (`demo/`) y su cobertura (CI, tests, contratos). **No se toca `src/`** salvo
> donde un ítem lo exija explícitamente y se declare por separado (§4.4, D1).
>
> **Estado**: plan. Sin implementación. `main` de referencia: `e607b06` (PR #135, demo-responsive).
> Versión publicada: `1.0.1`.

---

## 0. Resumen ejecutivo

Ordenado por relación retorno/esfuerzo. La columna de versión es la consecuencia operativa de la
regla vigente (§4.8): **lo que no toca `src/` no avanza la versión**.

| ID | Acción | Ficheros | Esfuerzo | Retorno | Oleada | ¿Avanza la versión? |
|---|---|---|---|---|---|---|
| **D2** | Badge «DOM reads» medido en vivo + renombrar FPS → ciclos/s | `demo/controls.ts`, `demo/static.html` | ~25 líneas · 0,5 d | **Crítico**: la métrica que sostiene la tesis central pasa de literal a medición | A | No |
| **D3** | Job `demo:build` en CI | `.github/workflows/ci.yml` | ~10 líneas · 0,5 d | **Alto**: verifica el artefacto más visible del repo | A | No |
| **D12** | Documentar el benchmark contra golden (2.228 ms / 5000 nodos) | `demo/README` o `demo/static.html` | ~10 líneas · 0,5 d | Medio: convierte un número suelto en evidencia | A | No |
| **D3b** | Guard de alcance de versión | `scripts/validate-release-scope.ts`, CI | ~35 líneas · 1 d | Medio-alto: convierte la regla de versión en invariante | B | No |
| **D5a** | Índice + scrollspy en el sidebar | `demo/static.html`, `demo/style.css` | ~50 líneas · 1 d | Alto: 18 secciones en 6652 px dejan de ser un scroller ciego | B | No |
| **D10** | Fijar con test que el foco sobrevive a un re-render | `tests/demo-behavior.test.ts` | ~20 líneas · 0,5 d | Medio: protege una fortaleza real hoy sin test | B | No |
| **D9** | Honestidad de `/ssr-stream` (emite un único chunk) | `src/ssr-stream.ts` (doc) o `demo/streaming-route.ts` | ~15 líneas · 0,5 d | Medio: la API pública no debe prometer más de lo que cumple | C | No (solo docs) |
| **D13** | Regla de revisión: todo hallazgo se contrasta con fuente + segunda medición | `odd/tasks/` | 1 doc · 0,5 d | Medio: evita falsos positivos como los dos de esta revisión | C | No |
| **D11** | Oráculos de comportamiento para los invariantes del demo | `tests/demo-behavior.test.ts` | ~80 líneas · 1,5 d | Medio-alto: hoy los tests del demo inspeccionan texto | C | No |
| **D6** | Dogfooding total: `bind()` en las salidas y helper único de cableado | `demo/*-showcase.ts`, `demo/controls.ts` | ~100 líneas · 2 d | Alto: elimina la causa de la clase de bugs de F2 | C | No |
| **D8** | Contrato de propiedad del layout (motor vs CSS) | doc + helper en `demo/` | ~1 d | Medio-alto: convierte una fricción repetida en regla | D | No |
| **D1** | Inspector de tres paneles: código → cálculo en memoria → resultado | `src/app.ts` (dev hook) + `demo/` | ~2-3 d | **Alto**: hace legible el modelo mental del framework | D | **Sí**, solo D1a |
| **D14** | Versionar el barrido de las 18 secciones como red de seguridad | `odd/evidence/`, `scripts/` | ~1 d | Medio: red reutilizable para todo cambio del demo | C | No |
| **D5b** | Vistas modulares (4 dominios) en lugar de mega-sidebar | `demo/static.html`, `demo/app.ts`, `demo/style.css` | ~2-3 d | Alto: el primer contacto pasa a ser la tesis, no 18 controles | E | No |
| **D7** | Comparativo head-to-head contra re-render DOM sin diff | `demo/` o `benchmarks/` | ~1-2 d | Medio-alto: cierra el argumento con una medición lado a lado | E | No |

**Secuencia recomendada**: Sprint A (1 día) → B (2 días) → C (2-3 días) → D (3-5 días) → E (2-3 días).
Cada sprint deja el repo coherente. Ningún sprint depende de que el anterior esté terminado, salvo
D1b, que necesita D1a.

**Decisiones que bloquean el inicio**: ninguna para el Sprint A. D3b, D7 y D1 requieren decisión
del mantenedor (§6).

---

## 1. Por qué este plan

El demo es la **única cara pública** del repositorio para quien no instala el paquete: `package.json`
publica `files: [dist, src, scripts/create-axiom.ts, scripts/templates, README.md, LICENSE, CHANGELOG.md]`.
`demo/` no llega a npm, luego no es un experimento interno: es el escaparate.

Y en ese escaparate hay una distancia entre lo que el demo **afirma** y lo que **demuestra**. Ese
es el objeto de este plan: cerrar la distancia. No se trata de añadir efectos ni features, sino de
que cada afirmación del demo sea verificable y de que el pipeline que lo produce esté cubierto.

Cuatro distancias concretas, medidas:

1. **La métrica que sostiene la tesis central es texto fijo.** `demo/static.html:374` contiene
   `<span class="metric-badge">0 DOM reads en hot path</span>`. El invariante sí está medido en el
   repo (`tests/architecture/app-steady-state-dom-reads.test.ts`, por intercepción de
   `window.innerWidth` y del `clientWidth` del elemento raíz), pero el demo, que es donde se convence
   al evaluador, lo afirma. → D2
2. **El pipeline del demo no está en CI.** `grep demo .github/workflows/*.yml` → 0 referencias. CI
   solo tiene los jobs `test` y `release-notes`. `tsc --noEmit` sí cubre `demo/**/*.ts`
   (`tsconfig.json:43`), así que los errores de tipo se atrapan; pero el bundle y la generación del
   sitio estático (`demo/build.ts`) no los ejecuta nadie automáticamente. → D3
3. **La cobertura del demo es de inspección de fuente, no de comportamiento.** La convención del
   repo (`tests/demo-sidebar-sections.test.ts`) es `expect(source).not.toContain("h('br'")`. Es un
   oráculo débil: renombrar una regla CSS rompe el test, y una regresión de comportamiento que
   conserve el texto lo deja pasar. El contraste con el S4 (oráculo fuerte, por intercepción) es el
   norte. → D11
4. **La navegación es un scroller ciego.** 18 secciones en 340 px de ancho y 6652 px de scroll; a
   1280 px solo se ven ~900 px, así que llegar a «Forms» cuesta unas siete pantallas. No hay índice,
   ni scrollspy, ni resaltado de sección activa. → D5a

Además hay dos fricciones estructurales que el demo expone y que conviene convertir en contrato
explícito:

5. **El motor es dueño de la geometría, y el consumidor tiene que reconciliarse a mano.** El motor
   escribe anchos y altos en píxeles fijos (`commit.ts`: `root.style.height = layout.height[rootIdx]`)
   y nunca encoge al contenedor. F1 (corregido en PR #135) fue exactamente eso: el canvas se
   desbordaba y su excedente quedaba inalcanzable; el arreglo fue que el **demo** midiera el
   espacio disponible con `getComputedStyle` + `clientWidth` y ajustara el ancho él mismo. Ese
   trabajo pertenece a una regla, no a un fichero suelto. → D8
6. **El demo reimplementa el framework en DOM plano.** El patrón «botón HTML estático +
   `addEventListener` + `<pre>` de salida» se repite unas diez veces (`ruta-b-showcase.ts` ×4,
   `syntax-showcase.ts` ×5, más dx, context, forms, router). No es un tema de gusto: es la causa
   directa de F2, donde `cellCount` (signal) y `updateStatus()` (escritura manual) divergieron y
   dejaron un botón inerte con estado 6/6. → D6

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
  (§4.4, D1) y con su propia unidad de trabajo.
- **N2** No introducir dependencias de runtime. El demo no se publica, pero el repo sí publica.
  Cualquier dependencia nueva es de desarrollo y debe justificarse por escrito (§6, D-b).
- **N3** No añadir features de producto al demo. Un showcase nuevo no es una mejora del showcase.
- **N4** No tocar la página pública de releases ni el contrato de versión, salvo el ítem D3b, que es
  explícitamente una decisión de política del mantenedor.

---

## 3. Elementos de partida que ya están bien

No todo es deuda. Esto se conserva y, en algún caso, se convierte en prueba fijada:

- **El benchmark ya compara contra el golden standard.**
  `demo/syntax-showcase.ts:272` — `GOLDEN_MS = 2.228` (5000 nodos, `benchmarks/.golden.json`),
  `GOLDEN_N = 500` con escalado proporcional y presupuesto de ≤ +5%. Es la credibilidad técnica más
  valiosa del demo y **no requiere trabajo**: solo un texto que lo explique (D12).
- **El foco sobrevive a los re-renders.** El botón «Clicks: 0» conserva el foco y el mismo nodo DOM
  tras el clic (`mismoNodo: true`): a11y correcto y evidencia directa de que el diffing reutiliza
  nodos en vez de recrearlos. Hoy nadie lo demuestra → D10.
- **El pie de métricas expone prepare / reflow / commit / TOTAL / POOL**, que es un banco de
  pruebas razonable. Le falta vivir → D2.
- **`window.__AXIOM__` expone `version`, `mounted`, `metrics`, `profiling`**. Es la superficie de
  introspección que hace posible D1. Le falta exponer el árbol/layout calculado.
- **`validate:api` + `docs/STABILITY.md`** verifican por máquina el contrato público. Ese es el
  patrón que el demo no tiene; el objetivo es replicarlo, no inventar otro.

---

## 4. Plan de trabajo

### 4.1 Oleada 1 — Cerrar la distancia (barato, alto retorno)

#### D2 — La métrica de la tesis, en vivo

**Problema.** `demo/static.html:374` muestra `<span class="metric-badge">0 DOM reads en hot path</span>`,
un literal que no prueba nada ante un evaluador escéptico.

**Solución.** Contar en runtime las lecturas al DOM que el motor hace, con la técnica del test S4, y
enlazar el contador al pie de métricas.

**Mecanismo concreto.** El motor lee exactamente cuatro propiedades, todas marcadas en
`src/app.ts:266-269` con `dom-read-allowlist: cached`:

```ts
maxWidth: root.clientWidth || 800,     // solo montaje y resize
maxHeight: root.clientHeight || 600,   // solo montaje y resize
viewportWidth: hasWindow ? window.innerWidth : undefined,
viewportHeight: hasWindow ? window.innerHeight : undefined,
```

Por tanto la intercepción debe cubrir **esos cuatro puntos y solo esos**:

| Propiedad | Dónde se intercepta | Por qué |
|---|---|---|
| `window.innerWidth` / `innerHeight` | `window` (global) | Lectura del viewport del motor |
| `root.clientWidth` / `clientHeight` | **solo sobre `#app`** | Lectura del contenedor del motor |

**El error a evitar**: interceptar `clientWidth` globalmente (por ejemplo sobre `Element.prototype`)
contaminaría el contador con **las lecturas del propio demo** —concretamente el `host.clientWidth` de
`fitCanvasWidth` en `demo/controls.ts`—. Entonces el badge mediría «lecturas del DOM en general» en
lugar de «lecturas del framework», que es la distinción que el badge afirma medir. Por eso el
alcance es *por elemento*, igual que hace `installRootCounters(root)` en el test S4.

**Por qué produce una demostración y no un número.** El motor cachea las restricciones de layout y
solo las refresca en `resize`. El contador debe dar **0** durante un ciclo de actualización y **>0**
al redimensionar. Esa disyuntiva es la prueba, en vivo, de la promesa.

**Criterio de aceptación.** El badge es dinámico: `0` en reposo e interactuando con los sliders, y
`>0` únicamente al redimensionar la ventana.

**Verificación.** (a) Test de comportamiento en happy-dom: durante una actualización por signal el
contador es 0; tras un `resize`, es >0. (b) En navegador: el badge cambia al redimensionar y vuelve a
0 al interactuar.

**Riesgo.** La intercepción añade getters en la ruta caliente. Se acota a cuatro propiedades y, si
el impacto se nota, se limita a instrumentar solo el `resize` en lugar del ciclo completo.

**Alcance.** `demo/controls.ts`, `demo/static.html`, un test nuevo. No toca `src/`.

**Esfuerzo.** ~25 líneas · 0,5 día.

**Corolario (mismo ítem).** `m-fps` cuenta **ciclos de actualización del framework por segundo**, no
frames del navegador (`demo/controls.ts:37`, `frameCount++` dentro de `updateMetrics`, disparado
por `requestAnimationFrame` tras cada interacción). En la revisión se observó `—` en reposo y el
texto sin cambiar en 400 ms: es un snapshot que se refresca al interactuar. Renombrar la etiqueta a
«ciclos/s» y actualizarla en vivo mientras el slider se arrastra, para que la métrica diga lo que
mide.

---

#### D3 — El demo entra en CI

**Problema.** `grep demo .github/workflows/*.yml` → 0 referencias. Un cambio en `src/` o en las
dependencias puede romper el bundle que genera `demo/build.ts` sin que ningún PR falle.

**Solución.** Un job nuevo en `.github/workflows/ci.yml` que ejecute `bun run demo:build` y falle
si el build rompe. Opcionalmente, un smoke test de las tres rutas (`/`, `/static.html`, `/ssr`).

**Mecanismo concreto.** Job `demo` con el mismo `bun-version` fijado que el job `test` (para que no
entre en rojo por una diferencia de toolchain), y `bun run demo:build` como único paso.

**Criterio de aceptación.** Ningún PR puede integrarse si `bun run demo:build` falla.

**Verificación.** (a) El job pasa en verde sobre `main`. (b) Un PR de prueba que rompa el bundle lo
pone en rojo — la misma prueba que se hizo con el guard de release-notes.

**Riesgo.** Bajo: es un job que hoy no existe. El riesgo real es que entre en rojo por un motivo
ajeno; se acota fijando `bun-version`.

**Alcance.** `.github/workflows/ci.yml`.

**Esfuerzo.** ~10 líneas · 0,5 día.

**Dependencia de versión.** Un job de CI no es un cambio de demo: se commitea como `ci(...)`, que
también es sección oculta en el changelog (§4.8). No avanza la versión.

---

#### D12 — Explicar el benchmark contra golden

**Problema.** El benchmark es la pieza de credibilidad más valiosa del demo (2.228 ms / 5000 nodos,
escalado a 500 en el demo, presupuesto ≤ +5%) pero se lee como un número suelto.

**Solución.** Un texto breve junto al benchmark que diga qué es el golden, dónde vive
(`benchmarks/.golden.json`), cómo se escala y qué presupuesto aplica.

**Criterio de aceptación.** Quien lee el bloque entiende qué se compara contra qué, sin abrir el
código.

**Esfuerzo.** ~10 líneas · 0,5 día.

---

### 4.2 Oleada 2 — Gobernanza y navegación (barato)

#### D3b — La regla de versión, verificada por máquina

**Problema.** La regla vigente («una corrección que no toca el framework no puede avanzar la versión»)
depende hoy de una convención externa: que `chore` sea sección oculta en el preset de changelog de
release-please 17.6.0. Verificado en el código de la herramienta y en producción (`✔ No user facing
commits found since 2869bbf - skipping`), pero **sin red de seguridad**: una actualización de
release-please, o un `changelog-sections` explícito en la config, lo cambiaría en silencio.

**Solución.** Un guard con la forma del guard que ya existe (`scripts/validate-release-notes.ts` +
job en CI).

**Mecanismo concreto.** `scripts/validate-release-scope.ts`:

1. Calcular el rango de commits del PR: `git diff --name-only origin/main...HEAD`.
2. Si **todos** los ficheros tocados están fuera de `src/` (`demo/`, `docs/`, `tests/`, `scripts/`,
   `odd/`) y algún commit del rango tiene tipo `fix:`, `feat:` o `!`/breaking, el script falla con un
   mensaje instructivo: «este commit no toca `src/`; usa `chore:` o `docs:` para no avanzar la
   versión».
3. El mensaje nombra los ficheros y los commits concretos, para que la corrección sea inmediata.

**Nota de criterio.** El criterio correcto **no es «demo»**, es **«no toca `src/`»**. `docs/`,
`tests/`, `scripts/` y `demo/` caen en la misma categoría. Hoy la regla está escrita como
`chore(demo):` porque los cambios eran de demo: es correcto por casualidad, no por regla.

**Criterio de aceptación.** CI rechaza un commit `fix(demo):` en un PR que no toca `src/`, y acepta
`feat(src):`, `chore(demo):` y `docs(odd):`.

**Verificación.** (a) Un commit de prueba `fix(demo):` sobre un PR que no toca `src/` pone el guard
en rojo. (b) Un commit `feat(src):` pasa. (c) Un commit `chore(demo):` pasa.

**Riesgo.** Es una política del repo, no un bug: **requiere decisión del mantenedor** (§6, D-a). Una
alternativa más suave: que el guard avise en vez de bloquear.

**Alcance.** `scripts/validate-release-scope.ts`, `.github/workflows/ci.yml`. No toca `src/`.

**Esfuerzo.** ~35 líneas · 1 día.

---

#### D5a — Índice y scrollspy en el sidebar

**Problema.** 18 secciones en 340 px y 6652 px de scroll. A 1280 px solo se ven ~900 px, así que
llegar a «Forms» cuesta unas siete pantallas. No hay índice ni forma de saber en qué sección se
está.

**Solución.** Un índice de salto en la cabecera del sidebar + resaltado de la sección visible.

**Mecanismo concreto.** (a) Índice sticky con las 18 entradas agrupadas en las cuatro categorías de
D5b (para que el agrupado se fije ahora y las vistas modulares lateren sobre él). (b) Scrollspy con
un `IntersectionObserver` (~25 líneas) que marca la entrada visible.

**Criterio de aceptación.** Se puede saltar a cualquier showcase en un clic, y el índice refleja en
todo momento la sección visible.

**Verificación.** (a) En navegador a 1280 px y a 480 px: el índice es alcanzable y el resaltado
sigue al scroll. (b) Los enlaces del índice llevan a su sección.

**Riesgo.** Bajo. Rozamiento con el scroll del sidebar: el `IntersectionObserver` debe tener un
`rootMargin` acorde al padding del contenedor.

**Alcance.** `demo/static.html`, `demo/style.css`, `demo/app.ts`. No toca `src/`.

**Esfuerzo.** ~50 líneas · 1 día.

---

#### D10 — Fijar que el foco sobrevive a un re-render

**Problema.** Es una fortaleza real y verificada (el botón «Clicks: 0» conserva el foco y el nodo DOM
tras el clic) que hoy no tiene ningún test que la proteja.

**Solución.** Un test de comportamiento que haga clic en un control que se re-renderiza y compruebe
que `document.activeElement` sigue siendo ese control y que el nodo es el mismo.

**Criterio de aceptación.** El test falla si el framework pasa a recrear nodos en un update.

**Esfuerzo.** ~20 líneas · 0,5 día.

---

### 4.3 Oleada 3 — Oráculos y dogfooding (medio)

#### D11 — Oráculos de comportamiento para el demo

**Problema.** Los tests del demo inspeccionan texto fuente (`expect(source).not.toContain(...)`), lo
que produce falsos positivos y negativos: renombrar una regla CSS rompe el test, y una regresión
de comportamiento que conserve el texto lo deja pasar.

**Solución.** Una suite `tests/demo-behavior.test.ts` en happy-dom (la convención del repo) que
asiente invariantes reales:

- El grid del demo nunca excede el tope de celdas, y el botón `+Celda` refleja ese tope por estado
  derivado, no por mutación manual.
- Tras pulsar `+Celda` y `−Celda`, el número de celdas en el DOM coincide exactamente con el valor
  del signal, y el texto del estado coincide.
- Al mover el slider de ancho, las columnas recalculadas en memoria se reflejan en la geometría del
  DOM.
- El canvas ajustado nunca excede el ancho del contenedor que lo hospeda.
- El foco del teclado (`activeElement`) se conserva tras re-renders reactivos.

**Criterio de aceptación.** La suite verifica el DOM generado y el comportamiento dinámico, no
cadenas de texto del código fuente.

**Verificación.** La suite pasa en verde; y una regresión real (por ejemplo, volver a activar
`updateStatus()` manual sin deshabilitar el botón) la pone en rojo.

**Esfuerzo.** ~80 líneas · 1,5 días.

---

#### D6 — Dogfooding total: el demo usa el framework para mostrar el framework

**Problema.** El patrón «señal + sincronización manual del DOM» aparece unas diez veces y ya produjo
un defecto real (F2). No es una cuestión estética: es la razón por la que el demo puede divergir de
lo que el framework haría.

**Solución.** (a) Las salidas que hoy se escriben a mano (`updateStatus()`,
`outputEl.textContent = ...`) pasan a usar `bind()` y las primitivas del framework.
(b) Un helper único de cableado para los controles externos
(`wireShowcase(root, { controls, outputs })`), que sustituye al patrón repetido en
`ruta-b-showcase.ts` (×4), `syntax-showcase.ts` (×5), `dx-showcase.ts`, `context-demo.ts`,
`forms-demo.ts` y `router-demo.ts`.

**Nota importante.** Los controles del demo son HTML estático **fuera** del árbol de Axiom, y el
propio código lo documenta: `addEventListener` es el escape hatch correcto ahí. La migración es de
las **salidas** y del cableado, no de la estructura de controles.

**Criterio de aceptación.** Cero discrepancias entre los valores de las señales internas y los textos
o estados visuales de los paneles; y los controles que tienen un límite (como `+Celda`) reflejan ese
límite por estado derivado, no por mutación imperativa.

**Verificación.** (a) Suite completa verde. (b) D11 en verde tras la migración. (c) En navegador: las
18 secciones siguen respondiendo (el barrido automatizado sirve de red).

**Riesgo.** Medio: toca muchos ficheros del demo, y es el ítem con mayor superficie de revisión. Se
beneficia de ir por showcased en grupos pequeños.

**Mitigación de riesgo.** La lección de `demo-ui-polish.md` sigue vigente: incrustar controles
dentro de un árbol del motor sin declarar dimensiones explícitas produce desbordamientos. El helper
debe mantener los controles en el contenedor host y coordinarlos por señales puras, sin meter
controles nativos en nodos con geometría no declarada.

**Esfuerzo.** ~100 líneas de refactor · 2 días.

---

### 4.4 Oleada 4 — Contrato y modelo mental (medio-alto)

#### D8 — Contrato de propiedad del layout

**Problema.** El motor escribe geometría en píxeles fijos y el consumidor debe reconciliarse con el
contenedor (F1 fue una instancia). El repo necesita una regla explícita de qué delega el motor y
qué delega al CSS, con sus escaping hatches.

**Solución.** Un documento de contrato (ubicación a decidir: `docs/` si es público, `odd/tasks/` si es
interno — §6, D-d) que fije: qué propiedades escribe el motor y con qué precedencia, qué puede
escribir el consumidor, qué escapas son válidas (`.btn-toggle` con `!important`,
`removeAttribute('style')`), y qué se hace cuando el contenedor es más pequeño que la geometría que
el motor escribió.

**Qué NO es.** No es un rediseño del motor ni un cambio de semántica. Es documentación, más —si
aparece en el camino— un helper compartido que remplace al ajuste manual de F1.

**Criterio de aceptación.** Un consumidor nuevo puede seguir el contrato sin leer el código del
motor, y el caso «contenedor más pequeño que la geometría» tiene una respuesta escrita y probada.

**Esfuerzo.** ~1 día.

---

#### D1 — Inspector de tres paneles

**Problema.** El demo muestra resultados, no el proceso. Para alguien que no conoce Axiom, ver
«20 columnas se calculan en 0,8 ms» no explica el modelo mental: falta el paso intermedio.

**Solución.** Tres paneles: **«Cómo se escribe en Axiom» → «Qué calcula el motor en memoria» →
«Resultado visual»**.

**Prerrequisito (toca `src/`).** El panel central requiere exponer el árbol o el layout calculado.
Hoy `window.__AXIOM__` expone `version`, `mounted`, `metrics`, `profiling`: no el árbol preparado.
Ampliar el dev hook **es un cambio de desarrollo** y, por la regla vigente (§4.8), avanza la versión
en su propia unidad de trabajo, separada del resto del ítem.

**Mecanismo concreto.** (a) `src/`: ampliar el dev hook en modo desarrollo para exponer el árbol
preparado / el layout (posiciones, tamaños, línea base), sin alterar la superficie de producción.
(b) `demo/`: un panel con las tres columnas, alimentado por ese dev hook.

**Criterio de aceptación.** El panel central muestra un layout que coincide coordenada a coordenada
con el resultado visual; y el dev hook no expone nada nuevo en modo producción.

**Verificación.** (a) Test que comprueba que el dev hook expone lo prometido y que no lo expone en
producción. (b) En navegador: las coordenadas del panel central coinciden con las del DOM renderizado.

**Riesgo.** Medio-alto. Ampliar el dev hook toca la superficie pública de `src/`, con su propio
presupuesto de revisión. El panel es la parte grande y opcional: puede entregarse el dev hook sin
el panel, o al revés.

**Alcance.** `src/app.ts` (dev hook) + `demo/` (panel) + tests. **Dos unidades de trabajo**: una de
`src/` (versionada) y una de demo (no versionada).

**Esfuerzo.** ~2-3 días.

---

### 4.5 Oleada 5 — Reestructuración y comparativa (alto)

#### D5b — De «mega-sidebar» a vistas modulares

**Problema.** El sidebar son 18 secciones en 340 px de ancho y 6652 px de scroll. Además la página
mezcla dos productos distintos: el showcase de la API (sintaxis v2, router, context, forms, portal,
plugins) y un playground del motor de layout (el masonry con slider de ancho). Audiencias e
intenciones distintas en la misma página.

**Solución.** Cuatro vistas según esta taxonomía:

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

**Criterio de aceptación.** Las 18 secciones siguen presentes y respondiendo; cada vista es
alcanzable en un clic desde el arranque; el demo sigue abriéndose como fichero local.

**Verificación.** (a) Barrido automatizado de las 18 secciones. (b) En navegador: navegación entre
vistas y enlace profundo por ancla, para que las referencias externas sigan funcionando.

**Riesgo.** Alto: es la reescritura de la página del demo y el que más riesgo de revisión tiene.
Mitigación: por vistas, en PR separados, manteniendo el enlace profundo por ancla.

**Esfuerzo.** ~2-3 días.

---

#### D7 — Demostrador comparativo

**Problema.** El demo demuestra que Axiom es rápido, pero no lo contrasta con nada. La comparación
es la que convierte un argumento en una medición.

**Solución.** Un botón que ejecuta la misma carga de trabajo —500 tarjetas reposicionándose— en dos
implementaciones y compara: lecturas al DOM, reflows, tiempo de commit y ciclos/s.

**Mecanismo concreto.** La comparación honesta es contra **re-render DOM sin diff** (la alternativa
ingenua), no contra un VDOM maduro: compararse contra Preact o React en la misma página es una
comparación que se puede acusar de poco generosa, y añade una dependencia de desarrollo al repo.
Lo que se mide son **lecturas al DOM y reflows**, no solo frames: ahí está la diferencia de fondo.

**Decisiones previas.** (a) ¿Se admite una dependencia de desarrollo (VDOM) o se limita a DOM
nativo? (b) ¿La comparación vive en el demo o en `benchmarks/`? La segunda es más honesta —el demo
muestra, el benchmark mide— y no altera el escaparate (§6, D-b y D-c).

**Criterio de aceptación.** La metodología (caso base, métrica, número de repeticiones) es visible
junto al número, no escondida.

**Verificación.** (a) El comparativo corre en CI o en `benchmarks/` con salida reproducible.
(b) La cifra del demo y la del benchmark coinciden.

**Esfuerzo.** ~1-2 días.

---

### 4.6 Ítems de apoyo

| ID | Qué | Motivo | Esfuerzo |
|---|---|---|---|
| D9 | Documentar que `renderToReadableStream` emite un único chunk, o marcarlo `@experimental` con esa advertencia visible | `src/ssr-stream.ts:22` — la API pública emite un chunk único; el demo lo admite, pero el análisis de producto lo pasó por alto | ~15 líneas · 0,5 d |
| D12 | Explicar el benchmark contra golden | Ver §4.1 | ~10 líneas · 0,5 d |
| D13 | Regla de revisión: todo hallazgo se contrasta con (a) el código fuente y (b) una segunda primitiva de medición | La revisión de esta sesión produjo dos falsos positivos: «14 de 18 secciones inalcanzables» (confusión sidebar/contenido + lectura de `elementFromPoint` con scroll suave en curso) y «err={}» (artefacto de serializar un `Error`) | 1 doc · 0,5 d |
| D14 | Versionar el barrido automatizado de las 18 secciones como red de seguridad del demo | El script de revisión automatizada (ego-browser, 77 comprobaciones) sirve de red para cualquier cambio del demo; hoy vive fuera del repo | ~1 d |

### 4.7 Lo que este plan NO hace

- No toca el motor. La única excepción prevista es el dev hook de D1, aislado en su propia unidad.
- No arregla el motor de layout para que encaje al contenedor: documenta el contrato (D8).
- No migra los controles externos del demo al árbol de Axiom: son HTML estático por diseño y
  `addEventListener` es el escape hatch correcto ahí.
- No publica el demo en npm ni cambia el `files` de `package.json`.
- No reescribe el benchmark: ya contrasta con el golden standard.

### 4.8 Relación con la regla de versión

Regla vigente: **un commit que no toca `src/` no avanza la versión**. Se aplica con el tipo de
commit, no con la ruta del fichero: `chore(...)` para demo, CI, scripts y docs; `docs(...)` para
documentación. Verificado en release-please 17.6.0 (`chore` es sección oculta del preset → sin
entrada de changelog → changelog vacío → el release se omite) y en producción.

Consecuencias sobre este plan:

- **D2, D3, D3b, D5a, D5b, D6, D7, D8, D9, D10, D11, D12, D13, D14 no tocan `src/`** → se commitean
  como `chore(demo):` / `ci(...)` / `docs(...)` y no avanzan la versión.
- **D1 tiene dos mitades**: la ampliación del dev hook toca `src/` → es una unidad `feat(src):` que
  avanza la versión por su cuenta; el panel del demo es `chore(demo):` y no avanza nada.
- **D7, si se decide medir en `benchmarks/`**, no toca `src/` → `chore(...)`; si además del
  comparativo saliera una mejora del motor, esa parte sería `feat(src):` aparte.

---

## 5. Dependencias y secuencia

```text
[D2 badge en vivo] ──┐
                     ├──► [D6 dogfooding] ──► [D11 oráculos de comportamiento]
[D3 build en CI] ────┤
                     │
[D3b guard versión] ─┴──► (independiente)

[D5a índice + scrollspy] ──► [D5b vistas modulares]

[D1a dev hook (src/)] ──► [D1b panel del inspector]
[D8 contrato de layout] ──► (informa D5b y D7)
```

| Sprint | Ítems | Entregable | Esfuerzo | ¿Avanza la versión? |
|---|---|---|---|---|
| **A** | D2, D3, D12 | El demo mide lo que dice y su build está en CI | 1 día | No |
| **B** | D3b (si D-a lo aprueba), D5a, D10 | La regla verificada por máquina y el sidebar navegable | 2 días | No |
| **C** | D11, D6, D9, D13, D14 | Oráculos de comportamiento y dogfooding | 2-3 días | No |
| **D** | D8, D1a + D1b | El contrato escrito y el inspector existente | 3-5 días | **Sí**, solo D1a |
| **E** | D5b, D7 | Demo navegable por vistas y comparativa | 2-3 días | No |

Cada sprint deja el repo en un estado coherente y publicable. Se puede parar tras cualquiera.

---

## 6. Decisiones que requieren del mantenedor

| ID | Decisión | Por qué no se decide aquí |
|---|---|---|
| D-a | ¿Se adopta el guard de alcance de versión (D3b) como política del repo? | Es una política, no un bug. Afecta a cómo se comitea a partir de ahora |
| D-b | ¿El comparativo (D7) admite una dependencia de desarrollo? | Añade superficie de supply-chain a un repo que publica en npm |
| D-c | ¿El comparativo vive en el demo o en `benchmarks/`? | El demo muestra; el benchmark mide. Mezclarlos resta credibilidad a la cifra |
| D-d | ¿El contrato de layout (D8) es documento público (`docs/`) o interno (`odd/tasks/`)? | Depende de si el repo quiere exponer el modelo de propiedad del layout como parte de su propuesta |
| D-e | ¿D5b se hace antes o después de D6 (dogfooding)? | D5b reescribe la página del demo; D6 reescribe su cableado. Hacer D5b antes implica cablear dos veces |
| D-f | ¿La ampliación del dev hook (D1a) entra en la siguiente versión? | Es `src/` y por tanto avanza la versión; conviene decidir si va con el siguiente cambio de framework o si espera |

---

## 7. Estrategia de verificación

El plan no hereda el problema que ya se detectó en la revisión: **un oráculo débil pasa
regresiones**. Reglas para todos los ítems:

1. **Comportamiento, no texto, cuando el invariante sea observable.** Los invariantes del demo
   (tope del grid, encaje del canvas, foco tras re-render, lecturas DOM del hot path) se asientan
   con tests en happy-dom, como el S4, no con `expect(source).toContain(...)`.
2. **Cada afirmación nueva del demo lleva su contrapruebo.** Si el demo dice «0 lecturas DOM», el
   test que lo demuestra está al lado; si dice «ciclos/s», el número se recalcula.
3. **Todo hallazgo se contrasta con el código fuente y con una segunda primitiva de medición**
   (D13). Es lo que evitó los dos falsos positivos de esta revisión.
4. **El barrido de las 18 secciones es la red de seguridad del demo** (D14). Debe quedar versionado
   y ejecutable, con sus artefactos en `odd/evidence/`, para que cualquier cambio del demo pueda
   reverificar las secciones en bloque.
5. **Cada ítem se verifica en navegador real**, no solo en tests. El demo es un artefacto visual:
   un test verde no dice si algo se ve bien.
6. **La suite completa y los validadores pasan antes de cada entrega**: `bun run typecheck`,
   `bun test` (coverage gate), `bun run validate:api`, `bun run validate:release-notes`.

---

## 8. Riesgos del plan

| Riesgo | Alcance | Mitigación |
|---|---|---|
| D5b reescribe la página del demo y rompe referencias externas | Enlace profundo por sección | Mantener anclas por sección y aceptar el redirect |
| D1 amplía la superficie pública de `src/` | Revisión y versión | Unidad de trabajo separada, con su propio presupuesto |
| D6 toca muchas partes del demo a la vez | Superficie de revisión | Ir por showcased en grupos pequeños |
| La intercepción de D2 falsea el hot path | Rendimiento del demo | Acotar a cuatro propiedades y, si molesta, instrumentar solo el `resize` |
| La intercepción de D2 capta lecturas del propio demo | La métrica mude de sentido | Instalar `clientWidth`/`clientHeight` **solo sobre `#app`**, no globalmente |
| D7 se percibe como publicidad | Credibilidad | Metodología visible junto al número; preferir `benchmarks/` |
| D3b se lee como rigidez en el versionado | Fricción diaria | Que el guard avise, no bloquee, si el mantenedor lo prefiere |
| El plan crece sin prioridad | Repo sin foco | Cada sprint es independiente y entregable; se puede parar tras el primero |

---

## 9. Log

- L1 (usuario, verbatim): «deme razones, motivos, sugerencias u otros puntos de vista del demo que se
  ha hecho hasta este punto».
- L2 (usuario, verbatim): «Crea un md con el plan para solucionar esos puntos que se llame
  "plan-demo-by-minimax.md". La ubicación dentro del proyecto es a criterio suyo.»
- L3 (usuario, verbatim): «OJO solo el plan, nada de implementación.»
- L4 (usuario, verbatim): «lea los md "plan-demo-by-gemini.md" y "plan-demo-by-minimax.md" para ver cuál
  es mejor de los 2 planes.»
- L5 (usuario, verbatim): «mejore el archivo plan-demo-by-minimax.md que es el suyo con lo que está
  diciendo.»
- D-1 (decisión): el plan vive en `odd/tasks/`, junto a `demo-ui-polish.md`, que es su documento
  hermano. `docs/` queda para lo que el repo muestra al mundo; este plan es material de trabajo.
- D-2 (decisión): el criterio de versionado se escribe como «no toca `src/`» y no como «demo»,
  porque es el que refleja la regla en sí, no la operación que la nacimiento de este plan.
- D-3 (decisión): el plan no toca el motor. D1 es la única excepción prevista y queda aislada en su
  propia unidad de trabajo, con su propio efecto sobre la versión.
- D-4 (decisión, L5): el plan se reescribe incorporando del plan paralelo (`plan-demo-by-gemini.md`)
  lo que lo hacía más ejecutable: matriz coste/retorno como primera sección, criterios de aceptación
  por ítem, estimaciones en líneas y días, grafo de dependencias, sprints con duración, y mecanismos
  concretos donde la redacción anterior era abstracta. Se conservan los contenidos que el plan
  paralelo no cubría: el inspector de tres paneles, el comparativo head-to-head, el contrato de
  propiedad del layout, la honestidad de `/ssr-stream`, la regla de método de revisión, la sección de
  lo que el plan no hace, la estrategia de verificación y las decisiones del mantenedor.
- D-5 (decisión, L4): del plan paralelo se adopta además su descomposición de la taxonomía del
  sidebar en cuatro dominios, y se separa la reorganization barata (índice y scrollspy, D5a) de la
  cara (vistas modulares, D5b), que estaba venir mezclada.
- D-6 (decisión, L4): se corrige un error técnico del plan paralelo en D2: la interección de
  `clientWidth`/`clientHeight` debe instalarse **solo sobre el elemento raíz del app**, no
  globalmente, o el contador capturaría también las lecturas del propio demo y mediría otra cosa
  distinta de la que el badge afirma.
