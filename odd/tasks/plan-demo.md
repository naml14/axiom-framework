# Feature: plan-demo — cerrar la distancia entre lo que el demo afirma y lo que demuestra

> Plan de implementación definitivo. Base: `plan-demo-by-minimax.md`, con las correcciones y
> mejoras de la comparación contra `plan-demo-by-gemini.md` (ver Log L3-L4). Referencia: `main`
> `e607b06`, versión publicada `1.0.1`. Alcance: `demo/`, `.github/workflows/`, `scripts/`,
> `tests/`, `docs/`. `src/` solo se toca en T12 (D1a), aislado en su propio commit.

Estado: implementación autorizada en curso. Rama: `docs/plan-demo`. Runner: Bun.
Entrega: `auto-chain`, `chain_strategy=feature-branch-chain`; commits locales por unidad, sin push ni PR.
Previsión: 1800–3000 líneas autoradas; cortes por tarea/grupo (~400 líneas), CI aislado.

---

## Cambios respecto a `plan-demo-by-minimax.md`

| # | Corrección / mejora | Motivo verificado |
|---|---|---|
| C1 | **D11 va antes de D6**, no después. | D6 es el refactor de mayor superficie; los oráculos de comportamiento (D11) son su red de seguridad. El grafo de §5 del plan base los tenía al revés y contradecía su propio sprint C. |
| C2 | **D3b valida commit por commit**, no el diff agregado del PR. | Con `git diff origin/main...HEAD` un `fix(demo):` dentro de un PR que también toca `src/` pasa el guard y avanza la versión igual. El repo integra con *merge commits* (`e607b06 Merge pull request #135`), así que cada commit individual llega a `main` y release-please los lee uno a uno. |
| C3 | **D9 se reduce**: `src/ssr-stream.ts:22` ya documenta el chunk único. | Queda: la sección `## Streaming SSR (experimental)` de `README.md:528` no lo menciona, y `demo/streaming-route.ts` hace *chunking artificial* (head + body con retardo) sin decirlo en la página visible. |
| C4 | **D14 queda bloqueado** hasta importar el script de barrido. | El script de ego-browser (77 comprobaciones) vive fuera del repo; sin él no hay nada que versionar. |
| C5 | **D3 no promete un `bun-version` fijado.** | El job `test` de `ci.yml` usa `bun-version: latest`. El job del demo reutiliza la misma configuración; fijar versión sería una decisión aparte (D-g). |
| C6 | **D2 confirma el alcance por elemento.** | El motor lee solo `root.clientWidth/clientHeight` y `window.innerWidth/innerHeight` (`src/app.ts:266-269`). La lectura del demo (`host.clientWidth`, `demo/controls.ts:117`) es sobre `appEl.parentElement`, no sobre `#app`; interceptar solo `#app` la excluye. El demo no lee `window.innerWidth/innerHeight`. |
| C7 | **D3 añade comprobación de artefactos.** | `demo/app.js` y `demo/static-out/` están en `.gitignore`; comprobar que el build los genera y no están vacíos detecta un build que "pasa" sin producir nada. |
| C8 | Recomendación explícita para D-e: **D6 antes de D5b**. | Si D6 encapsula el cableado de cada showcase en `wireShowcase`, D5b solo reubica secciones y no las recablea. |

---

## Specs

Criterios de aceptación por ítem. Cada `S#` es lo que la verificación debe demostrar.

- **S1 (D2, corregida por autorización L11)** El badge «DOM reads» del pie muestra el valor real medido por ciclo de interacción, sin forzar cero: puede ser `>0` al cambiar controles o redimensionar por las lecturas de constraints de los observadores de tamaño. Un texto distingue esas lecturas del hot path aritmético. La intercepción cubre exactamente `window.innerWidth`, `window.innerHeight` y `clientWidth`/`clientHeight` **solo sobre `#app`**, nunca sobre `Element.prototype`. Se excluyen las lecturas iniciales de montaje al iniciar el primer ciclo medido.
- **S2 (D2)** La métrica `m-fps` (`demo/controls.ts:37`) se rotula «ciclos/s» y se actualiza
  mientras se arrastra un slider.
- **S3 (D3)** CI ejecuta `bun run demo:build` en cada PR y push a `main`; el job falla si el build
  falla o si `demo/app.js` o `demo/static-out/index.html` no existen o están vacíos.
- **S4 (D12)** Junto al benchmark del demo, un texto explica qué es el golden
  (`GOLDEN_MS = 2.228`, 5000 nodos, `benchmarks/.golden.json`), cómo se escala a 500 nodos y el
  presupuesto ≤ +5 %, sin tener que abrir el código.
- **S5 (D10)** Un test falla si el framework recrea el nodo del botón «Clicks» en un update:
  `document.activeElement` y la identidad del nodo se conservan tras el clic.
- **S6 (D5a)** El sidebar tiene un índice sticky con las 18 secciones agrupadas en los cuatro
  dominios de D5b; cada entrada salta a su sección en un clic y la entrada de la sección visible se
  resalta (scrollspy con `IntersectionObserver`). Funciona a 1280 px y a 480 px.
- **S7 (D3b)** Un guard de CI rechaza **cada commit** del rango cuyo tipo sea `feat`, `fix` o
  breaking (`!` o `BREAKING CHANGE`) y que no toque ningún archivo bajo `src/`. El mensaje nombra
  el commit y sus archivos y sugiere `chore:`, `docs:`, `test:` o `ci:`. Acepta `feat(src):` que
  toque `src/`, `chore(demo):` y `docs(odd):`. Modo bloqueante o aviso según D-a.
- **S8 (D11)** `tests/demo-behavior.test.ts` (happy-dom) verifica comportamiento, no texto fuente:
  tope de celdas del grid y estado deshabilitado de `+Celda` derivado del signal; número de celdas
  en el DOM igual al signal tras `+Celda`/`−Celda` y texto de estado coherente; el slider de ancho
  cambia la geometría del DOM; el canvas ajustado nunca excede su contenedor. La suite se pone en
  rojo si se reintroduce la escritura manual de F2.
- **S9 (D6)** Las salidas escritas a mano (`updateStatus()`, `outputEl.textContent = ...`) pasan a
  `bind()`/suscripciones a signals mediante un helper `wireShowcase` en `demo/`. Los controles HTML
  estáticos siguen con `addEventListener` (escape hatch legítimo). Cero discrepancias entre signal y
  vista en las 18 secciones; S8 sigue en verde.
- **S10 (D9)** `README.md` (sección Streaming SSR) dice que la implementación actual emite un único
  chunk; la página `/ssr-stream` indica visiblemente que su chunking es artificial.
- **S11 (D13)** Existe una regla de revisión escrita en `odd/`: todo hallazgo visual se contrasta
  con el código fuente y con una segunda primitiva de medición antes de reportarse.
- **S12 (D8)** Un documento de contrato fija qué escribe el motor (posición absoluta, `transform`,
  `width`, `height`, `box-sizing`, `padding:0` inline) y con qué precedencia, qué puede escribir el
  consumidor, los escape hatches válidos (`!important` en shells externos, `removeAttribute('style')`)
  y qué hacer cuando el contenedor es menor que la geometría escrita (caso F1). Ubicación según D-d.
- **S13 (D1a)** Con `__AXIOM_DEV__ = true`, `window.__AXIOM__` expone una copia de solo lectura del
  layout calculado (posiciones, tamaños); en producción no expone nada nuevo. Test de ambos casos.
- **S14 (D1b)** Un panel de tres columnas («Cómo se escribe» → «Qué calcula el motor» → «Resultado
  visual») cuyo panel central coincide coordenada a coordenada con el DOM renderizado.
- **S15 (D5b)** Cuatro vistas (Core & Layout Engine · Syntax & Reactivity · Application Layer ·
  DX & Runtime) seleccionables por signal en una sola URL; la vista 1 es la inicial; las 18
  secciones siguen presentes y respondiendo; enlaces profundos por hash; el demo sigue abriéndose
  como `file://`.
- **S16 (D7)** Un comparativo ejecuta la misma carga (500 tarjetas reposicionándose) en Axiom y en
  re-render DOM sin diff, y reporta tiempo, lecturas al DOM y reflows, con la metodología (caso
  base, métrica, repeticiones) visible junto al número. Ubicación según D-c; sin dependencias
  nuevas salvo que D-b lo apruebe.
- **S17 (D14)** El barrido de las 18 secciones queda versionado en `scripts/` y ejecutable, con
  artefactos en `odd/evidence/`.

---

## Tasks

Ruta por defecto: inline (cada ítem es una unidad pequeña o secuencial). Riesgo según la sección
Task Size del orquestador. Commit: pendiente hasta implementar.

| ID | Ítem | Specs | Sprint | Depende de | Riesgo | Commit previsto | Estado |
|---|---|---|---|---|---|---|---|
| T1 | D2 contador DOM reads + ciclos/s | S1, S2 | A | — | none | `chore(demo): measure dom reads live and label cycles per second` | en curso (S1 real autorizado) |
| T2 | D3 build del demo en CI | S3 | A | — | item 5 (CI) | `a569326` | implementado; verificación independiente final pendiente |
| T3 | D12 explicar el golden | S4 | A | — | none | `docs(demo): explain the golden benchmark next to its number` | pendiente |
| T4 | D10 test de foco y nodo | S5 | B | — | none | `23fea6a` | hecho: botón real, 3 clics/foco/identidad/texto |
| T5 | D5a índice + scrollspy | S6 | B | — | none | `chore(demo): add a grouped index and scrollspy to the sidebar` | delegado (context backstop) |
| T6 | D3b guard de alcance de versión | S7 | B | D-a | item 5 (CI) | `a569326` | 12 tests/38 assertions verdes; verificador final pendiente |
| T7 | D11 oráculos de comportamiento | S8 | C | — | none | `46359e4` | hecho: 4 tests/183 assertions + typecheck |
| T8 | D6 dogfooding + `wireShowcase` | S9 | C | T7 | item 6 parcial (mitigado por T7) | `chore(demo): bind showcase outputs through a shared wiring helper` (por grupos) | delegado (context backstop) |
| T9 | D9 honestidad de `/ssr-stream` | S10 | C | — | none | `9dbe1e5` | hecho: disclosure existente + README corregido |
| T10 | D13 regla de revisión | S11 | C | — | none | `9dbe1e5` | hecho: readback + diff --check |
| T11 | D8 contrato de layout | S12 | D | D-d | none | `9dbe1e5` | hecho: contrato contrastado con cliente/SSR |
| T12 | D1a dev hook en `src/` | S13 | D | D-f | item 3 (superficie pública) | `feat(devhook): expose the computed layout in development` (commit propio) | bloqueado (D-f) |
| T13 | D1b panel inspector | S14 | D | T12 | none | aplazado | bloqueado: siguiente cambio del core (D-f/T12) |
| T14 | D5b vistas modulares | S15 | E | T5, D-e | item 6 parcial (mitigado por T7) | `chore(demo): split the sidebar into four domain views` (por vista) | bloqueado (D-e) |
| T15 | D7 comparativo | S16 | E | D-b, D-c | none | `chore(benchmarks): compare against naive dom re-render` | delegado mvkaj79k-3-337y |
| T16 | D14 barrido versionado | S17 | — | script externo | none | `chore(demo): version the 18-section sweep` | bloqueado (script fuera del repo) |

### Secuencia

```text
Sprint A (1-2 d, sin decisiones)   T1 D2 ── T2 D3 ── T3 D12
Sprint B (2 d)                     T4 D10 ── T5 D5a ── T6 D3b (si D-a)
Sprint C (2-3 d)                   T7 D11 ──► T8 D6       T9 D9   T10 D13
Sprint D (3-5 d)                   T11 D8 (si D-d)   T12 D1a (si D-f) ──► T13 D1b
Sprint E (2-3 d)                   T5 ──► T14 D5b (si D-e)   T15 D7 (si D-b, D-c)
Bloqueado                          T16 D14 (hasta importar el script)
```

Cada sprint deja el repo coherente; se puede parar tras cualquiera. Solo T12 avanza la versión.

### Notas de implementación por tarea

- **T1**: el contador vive en un módulo propio (`demo/dom-read-counter.ts`) con una función
  `installDomReadCounter(root, win)` instalada **antes** de `app.mount()` en `demo/app.ts`, para que
  el test de happy-dom lo use sin el resto del demo (técnica de `installRootCounters` en
  `tests/architecture/app-steady-state-dom-reads.test.ts`). El badge se refresca desde
  `updateMetrics()`. Si la intercepción se nota en el hot path, se limita a instrumentar el
  `resize`.
- **T2**: job `demo` ("Demo build") en `.github/workflows/ci.yml`, con el mismo checkout fijado por
  SHA y la misma configuración de Bun que `test`; pasos: `bun install`, `bun run demo:build`,
  comprobación `test -s demo/app.js && test -s demo/static-out/index.html`. Si la rama protegida
  exige checks por nombre, añadir "Demo build" a la regla es decisión del mantenedor. Verificación:
  verde sobre la rama; un commit de prueba local que rompa el bundle hace fallar
  `bun run demo:build`.
- **T6**: reutilizar la forma de `scripts/validate-release-notes.ts` (sin dependencias, solo Git).
  Recorrer `git rev-list --no-merges base..head`; por commit, leer asunto y cuerpo y
  `git diff-tree --no-commit-id --name-only -r <sha>`. Excluir los commits de release-please
  (`chore(main): release ...`). Tests con repos temporales que cubran: `fix(demo):` sin `src/` →
  rechazo; `feat(src):` con `src/` → acepta; `chore(demo):` → acepta; PR mixto con un
  `fix(demo):` aislado → rechazo (el caso que el plan base dejaba pasar).
- **T7**: si algún invariante no se puede montar en happy-dom sin el HTML completo, extraer la
  lógica a una función pura del demo antes que volver a inspeccionar texto fuente.
- **T8**: por grupos de showcases (`ruta-b-showcase.ts`, `syntax-showcase.ts`, luego dx, context,
  forms, router), un commit por grupo, con T7 en verde tras cada uno. Mantener los controles en el
  contenedor host (lección de `demo-ui-polish.md`: controles nativos dentro de nodos del motor sin
  geometría declarada producen desbordes).
- **T12**: unidad aislada; es el único `feat` del plan y el único que avanza la versión.

---

## Decisiones del mantenedor

| ID | Decisión | Bloquea | Recomendación |
|---|---|---|---|
| D-a | ¿El guard D3b bloquea o solo avisa? | T6 | Bloqueante: es la única forma de que la regla deje de depender de la convención de release-please. |
| D-b | ¿El comparativo admite dependencias de desarrollo (React/Preact)? | T15 | No: comparar contra DOM nativo sin diff. |
| D-c | ¿El comparativo vive en el demo o en `benchmarks/`? | T15 | `benchmarks/`, enlazado desde el demo. |
| D-d | ¿El contrato de layout es público (`docs/`) o interno (`odd/`)? | T11 | Público: `docs/LAYOUT_CONTRACT.md`. |
| D-e | ¿D5b antes o después de D6? | T14 | Después de D6 (C8). |
| D-f | ¿D1a sale en la próxima versión o espera al siguiente ciclo del core? | T12 | Acumular con el siguiente cambio del core. |
| D-g | ¿Fijar `bun-version` en CI en vez de `latest`? | — (no bloquea) | Opcional; afecta a todos los jobs, no solo al del demo. |

---

## Verificación (todas las tareas)

1. Comportamiento, no texto: invariantes observables con tests en happy-dom, como S4/S8.
2. Cada afirmación nueva del demo lleva su prueba al lado.
3. Todo hallazgo se contrasta con el código fuente y con una segunda medición (D13).
4. Cada ítem visual se verifica en navegador real a 1280 px y 480 px.
5. Antes de cada entrega: `bun run typecheck`, `bun run test:coverage`, `bun run validate:api`,
   `bun run validate:release-notes`, `bun run demo:build`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La intercepción de D2 capta lecturas del demo | Getters solo sobre `#app` y `window` (C6). |
| La intercepción de D2 penaliza el hot path | Cuatro propiedades; si se nota, solo durante `resize`. |
| D6 y D5b tocan muchas secciones | T7 antes; commits por grupo o por vista. |
| D5b rompe enlaces externos | Anclas por sección y hash por vista. |
| D1a amplía la superficie pública | Commit propio, solo en modo dev, test de producción. |
| D3b genera fricción diaria | Modo aviso si D-a lo prefiere. |

---

## Ejecución autorizada

- D-a: guard bloqueante, necesario para que S7 impida avances de versión accidentales.
- D-b/D-c: DOM nativo sin dependencias, en `benchmarks/`, enlazado desde el demo (S16).
- D-d: contrato público `docs/LAYOUT_CONTRACT.md`, necesario para consumidores (S12).
- D-e: T14 después de T8, preserva los oráculos de T7 antes del refactor.
- D-f: T12/T13 aplazadas al siguiente cambio del core; no se modifica `src/` ahora.
- D-g: sin cambios; fijar Bun no es necesario para S3.
- T16 espera la importación autorizada del script externo; no se inventa un sustituto.
- Rutas: T1–T6/T9/T10/T11 inline; el intento de escritor CI fue rechazado por el formato de referencia y no se reintenta. T7 (oráculos) y T15 (comparativo) son unidades independientes (>100 líneas cada una), delegadas juntas con superficies disjuntas. T5/T14 secuencial tras T8; T8 por grupos.
- Estado inicial ajeno preservado: cambios `.atl/`, eliminación `odd/tasks/plan-demo-by-minimax.md`; este documento ya era untracked.
- RDD no disponible: `gentle-ai review mode status` rechaza el propietario de `.git/gentle-ai`. No se cambia propiedad ni autoridad; verificaciones funcionales siguen siendo necesarias.

## Log

- **L15** (cortes): T4 `23fea6a` (36 líneas); CI T2/T6 `a569326` (213 líneas). Guard: 12 tests/38 assertions, exit 0, entrada inválida/repositorio intacto y merge/PR mixto cubiertos. CI remoto no ejecutado (sin autorización de push); verificador independiente item 5 al cierre. T8 y la integración build T15 continúan en escritores; navegador espera el bundle definitivo. No se afirma completitud de esos ítems.

- **L14** (corte docs): `9dbe1e5`, 139 líneas autoradas, T9/T10/T11 (S10-S12); comprobación estructural, fuentes verificadas y diff --check. Sin RED por documentación pasiva. T4: prueba del botón Clicks real pasó con identidad, foco y texto tras tres clics; no RED porque es regresión de un comportamiento existente correcto.

- **L13** (cortes de entrega): base de ejecución `446b3e6`; corte T7 `46359e4` (224 líneas autoradas). La rama ya incluía documentación anterior al plan; no se reempaqueta. Estrategia acordada `feature-branch-chain`: cada corte local será una futura revisión dependiente, sin publicar ni crear PR. Siguientes cortes: T1, CI (T2/T6), T5/T3, T15, T8 por grupos, docs, T14.

- **L12** (spot check): `bun test tests/demo-behavior.test.ts tests/demo-navigation.test.ts tests/dom-comparison.test.ts tests/demo-dom-read-counter.test.ts && bun run typecheck`: exit 0; 13 tests, 2879 assertions. T7 listo; T5/T15 aún requieren navegador e integración. Assess nativo no evaluable por archivos untracked; sin autoridad alterada ni revisión declarada aprobada.

- **L11** (usuario, verbatim): «el navegador ego está basado en chromium así puede mantenerlo.» Confirmación UI posterior: «Sí, mostrar el valor real», ante «¿Acepta corregir S1 para mostrar las lecturas reales medidas por ego-browser, sin forzar un cero ni modificar el core?» S1 corregida; el resto del alcance se conserva.

- **L8** (evidencia): T1 RED por módulo ausente; GREEN 3 tests/25 assertions; typecheck, coverage, validate:api, validate:release-notes, demo:build y artefactos pasaron en job-1. Navegador real file://, espacio 4: contador 26 tras ancho/resize y 2 tras cambiar ítems, incluso esperando dos rAF. `src/app.ts:234-245` refresca constraints también por ResizeObserver del root; montar las otras apps también lee window. S1 «>0 solo al redimensionar la ventana» no describe el runtime actual. No se ocultan esas lecturas ni se toca src/ sin resolver el alcance.
- **L9** (evidencia T7): escritor mvkaj738-2-ipf2 agregó oráculos y efecto reactivo mínimo de grid; RED 3 celdas frente a estado 6/6; GREEN 4 tests/183 assertions, mutación F2 detectada. Typecheck pendiente por archivos de escritores concurrentes.
- **L10** (evidencia T6): RED 11 tests por comando ausente, GREEN 11 tests/32 assertions; script nuevo listo, integración CI/documentación pendientes. T2 job añadido; CI remoto no ejecutado.

- **L5** (usuario, verbatim): «ejecute el plan del archivo "plan-demo.md"».
- **L6** (usuario, verbatim): «aplique las recomendaciones si es que hacen falta realmente, de no ser necesarias no las agregue.».
- **L7** (autorización UI): lectura de documentos de herramientas externos enumerados; entrega seleccionada «Cadena sobre una rama de seguimiento (recomendado)».

- **L1** (usuario, verbatim): «lea los md "plan-demo-by-gemini.md" y "plan-demo-by-minimax.md" para
  ver cuál es el mejor para implementar.»
- **L2** (usuario, verbatim): «ok, entonces cree el plan a implementar con lo que me respondió. que
  el mejor es el de minimax con correcciones o mejoras.»
- **L3** (evidencia): comparación. Minimax gana por precisión técnica de D2, criterios de aceptación
  por ítem, separación D5a/D5b, sprints con duración, estrategia de verificación y tabla de riesgos.
  Gemini aportaba el orden correcto D11 → D6 y una tabla de gobernanza de commits más clara.
- **L4** (evidencia verificada en el repo): `src/app.ts:266-269` (cuatro lecturas del motor);
  `demo/controls.ts:113-118` (lectura del demo sobre `appEl.parentElement`); `.github/workflows/ci.yml`
  sin referencias al demo y con `bun-version: latest`; `.gitignore` excluye `demo/app.js` y
  `demo/static-out/`; `src/ssr-stream.ts:22` ya documenta el chunk único; `demo/streaming-route.ts`
  hace chunking artificial; `README.md:528` no menciona el chunk único; el historial usa merge
  commits; `release-please-config.json` no define `changelog-sections`.
- **D-1** (decisión): este documento sustituye a los dos planes como plan a implementar; los
  originales se conservan como fuentes.
- **L16** (usuario, verbatim): «retome la ejecución del plan "plan-demo.md"».
- **L17** (evidencia T1/T5/T8/T15, navegador real): Edge/Chromium sobre CDP, `file://` y HTTP, a
  1280 px y 480 px. 18 secciones, 18 entradas de índice, 4 dominios, etiqueta «ciclos/s» viva y
  badge con lecturas reales (28 al cargar, 30 tras redimensionar, 56 a 480 px), sin desbordamiento
  horizontal en ninguno de los dos anchos. Grid coherente con su signal (6/6 → 5/5 → 6/6 celdas,
  estado y botones deshabilitados derivatives), layout DSL «mode: grid — 4 items», inspector del
  router por HTTP (`/about`, `/users` con `matched.name`), DX «Hot Reload Recovery: ON», página de
  comparación con mediana, 30 barreras por alternativa, 500 tarjetas por lado y la etiqueta honesta
  «reflows: no disponible». **Defecto encontrado por medición real**: tras pulsar una entrada del
  índice el resaltado caía en la sección anterior, porque el observer elegía la primera sección
  que intersectaba en orden del DOM y no la que ocupa el área visible. RED: 2 tests nuevos fallan
  con la regla anterior; GREEN con «la sección que más ocupa el área de observación». El
  `pushState` del router falla bajo `file://` (`SecurityError`): comportamiento previo del core,
  fuera del alcance del plan; el router se verificó por HTTP.
- **L18** (usuario, verbatim): «elimine los archivos md de minimax y de gemini que ya no vamos a
  usar, ojo solo esos 2 archivos md nada más.». `odd/tasks/plan-demo-by-gemini.md` nunca llegó a
  versionarse; `odd/tasks/plan-demo-by-minimax.md` sí estaba versionado y su eliminación se
  incluye en el corte del documento de plan, de modo que el repositorio queda coherente con la
  decisión D-1.
