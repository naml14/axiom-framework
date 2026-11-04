# Feature: demo-visual-refresh

Refresh the visual design of the Axiom demo (`demo/`) so the showcase reads as a polished
product and speaks with the same palette as the logo. The framework version must not change.

## Specs

- **S1** — "revise el diseño del demo de mi desarrollo actual y lo mejore para que sea atractivo"
  - Alcance: capa visual de `demo/` (`demo/style.css`, `demo/index.html`, `demo/static.html`,
    `demo/sidebar-navigation.css`, `demo/launcher.js`, `demo/data.ts`, `demo/ruta-b-showcase.ts`,
    `demo/ssr-page.tsx`, `demo/streaming-route.ts`).
    No se toca `src/`: el motor de layout es aritmética pura y su geometría es intencional.
  - Contrato visual heredado de `odd/tasks/demo-ui-polish.md`: `line-height` ≤ 20px en texto de árbol,
    cero `padding`/`border` CSS que desplace hijos del motor, `height` explícito en filas y controles,
    nada de `attrs.style`, nada de `<br>`, `width` explícito en cada hijo de un `row`.
  - Criterio: el demo se ve más atractivo sin perder legibilidad ni romper el layout del motor.

- **S2** — "Esto no debe aumentar la versión del framework."
  - `package.json` `version` sigue en `1.0.1`; `.release-please-manifest.json` intacto.
  - Todos los commits de este feature usan `chore(demo):`, `test(demo):` y `docs(...)`:
    release-please solo avanza la versión por tipos con entrada de changelog (`feat`, `fix`, …),
    y `chore`/`test`/`docs` caen en secciones ocultas del preset (regla G2 de
    `odd/tasks/backlog-pendientes.md`, verificada contra release-please 17.6.0).

- **S3** — "creo que la paleta de colores debería ser congruente con el logo, hay imágenes en el repo creadas que tienen unos colores. Si faltan complete con teoría del color para web."
  - La paleta se **deriva de los píxeles del logo** (`Images/axiom-logo.png`,
    `Images/axiom-logo-no-letras.png`), no de una apreciación visual.
  - Las dos semánticas que el logo no tiene (warning, danger) se completan con teoría del color:
    ámbar (complemento del azul de marca) y rosa (opuesto del cian-verde), fuera de la banda de
    matiz del logo para que no se confundan con un color de marca.
  - Todo token de texto queda en ≥ 5.2:1 sobre la superficie más clara (AA con margen).

## Tasks

- [x] T1. Design system sync: `design/system.md` + `design/system.html` desde `demo/style.css` y `scripts/templates/src/styles.css` (solo lectura de fuentes) — S1 — commit `ffe3742`
- [x] T2. Dirección visual en `design/axiom-demo-refresh/` (3 artboards del shell y el launcher) + canvas abierto — S1 — commit `ffe3742`
- [x] T3. Paleta derivada del logo: tokens, vocabulario de acentos, `demo/data.ts`, `demo/ruta-b-showcase.ts`, páginas SSR — S3 — commit `20b35aa`
- [x] T4. Shell del dashboard: escala tipográfica, tokens de espaciado/radio/sombra, cards, chips, sidebar, barra de métricas — S1, S3 — commit `83e6c2b`
- [x] T5. Launcher: tokens rotos corregidos, portada rediseñada, `launcher.js` deshabilita todos los enlaces de servidor — S1 — commit `79c2ef3`
- [x] T6. Guardas de regresión en `tests/demo-visual-contract.test.ts` (tokens, línea de base del motor, banda de matiz del logo) — S1, S3 — commit `35120b3`
- [x] T7. Verificación: `bun run typecheck`, `bun test`, `bun run demo:build`, matriz de capturas antes/después y medición en navegador — S1, S2, S3 — commits `20b35aa`..`35120b3`
- [x] T8. Commits de unidad de trabajo sin tocar versión ni manifiesto de release — S2 — commits `20b35aa`, `83e6c2b`, `79c2ef3`, `35120b3`, `ffe3742`

## Log

- L1 (usuario, verbatim): "perfecto, ahora necesito que revise el diseño del demo de mi desarrollo actual y lo mejore para que sea atractivo. Esto no debe aumentar la versión del framework."
- L2 (decisión, 2026-11-04): la revisión se hace con evidencia de navegador (Edge headless, capturas
  antes/después por página) y con contraste contra el código fuente, conforme a `odd/VISUAL_REVIEW.md`
  (dos primitivas de medición, no una sola captura).
- L3 (hallazgo, 2026-11-04): `demo/index.html` usaba `var(--surface-1)` y `var(--shadow-soft)`, tokens
  que no existen en `demo/style.css` (`--surface`, `--surface-2`, `--surface-3` y ningún `--shadow-*`).
  La card del launcher quedaba sin fondo ni sombra: confirmado en captura y en el código.
- L4 (decisión, 2026-11-04): la mejora se aplica en la capa visual del demo; no se modifica `src/` ni
  se altera `package.json` (`version: 1.0.1`) ni `.release-please-manifest.json`.
- L5 (usuario, verbatim): "creo que la paleta de colores debería ser congruente con el logo, hay
  imágenes en el repo creadas que tienen unos colores. Si faltan complete con teoría del color para web."
- L6 (medición, 2026-11-04): los PNG del logo se decodificaron y se midieron sus colores dominantes
  (`#1d2239` 34.5%, `#263456` 17.9%, `#306fcc` 6.4% matiz 215, `#36a0de` 4.5% matiz 202, `#34cadb`
  2.7% matiz 186, `#708ec8` 4.1% matiz 220, `#0f50b5` 1.9% matiz 216, `#100e24` de fondo). La paleta
  anterior era violeta (`#7c3aed`/`#a78bfa`): no coincidía con el logo.
- L7 (decisión, 2026-11-04): `--accent-blue` `#5ea3f7`, `--accent-cyan` `#26c7d9`, `--accent-indigo`
  `#83a0db` (matices del logo) más `--accent-amber` `#f9a806` y `--accent-rose` `#fb768c`, completadas
  por teoría del color (complemento del azul; opuesto del cian-verde) y por tanto fuera de la banda
  180-231 del logo. Superficies: rampa naval del logo (`#090b13` → `#262d43`). Todos los tokens de
  texto ≥ 5.2:1 sobre `--surface-3`.
- L8 (verificación, 2026-11-04): `bun run typecheck` exit 0; `bun test` 884 pruebas (882 pass, 2 skip
  preexistentes, 0 fail) con 8 guardas nuevas; `bun run demo:build` regenera `demo/app.js`,
  `demo/dom-comparison.js` y `demo/static-out/` sin cambios de API. En navegador (Edge headless,
  1440x900) se capturaron `/`, `/static.html`, `/ssr`, `/ssr-stream` antes y después; la medición por
  CDP sobre los 12 hosts del motor reporta 0 desbordes (`scrollHeight > clientHeight`), 0 recortes
  horizontales y 0 elementos fuera de su contenedor (el primer pase encontró 8 desbordes de 2px en
  los tag bubbles, corregidos bajando su line-height a 18px porque el borde de 1px se come 2px de la
  fila de 20px).
- L9 (decisión, 2026-11-04): la rama `docs/plan-demo` ya arrastra 4371 líneas autoradas en 19 commits
  desde `origin/main` (límite de review ≈ 400 por corte). Este feature no re-empqueta la rama: sigue
  la estrategia `feature-branch-chain` acordada en `odd/tasks/plan-demo.md` (L13) — commits locales
  por corte revisable, sin push ni PR. Los 6 commits de este feature son:
  `20b35aa` paleta, `83e6c2b` shell, `79c2ef3` launcher, `35120b3` guardas, `ffe3742` design system,
  y este documento.
- L10 (verificación, 2026-11-04): `demo/app.js` y `demo/dom-comparison.js` se regeneran sin cambios
  respecto al bundle previo salvo el vocabulario de colores (`blue`/`cyan`/`indigo` en lugar de
  `violet`/`teal`/`sky`); el framework publicado (`src/`, `dist/`) no se toca.
- L11 (decisión, 2026-11-04): el usuario eligió en el canvas **Launcher hero** para la portada y
  **Dashboard shell** para el static. La implementación se ajustó al artboard: los chips del canvas
  llevan el punto de color (un `::before`, con su sitio reservado en el ancho declarado:
  `getTagWidth` pasa de +26 a +40px, así el texto no se recoloca), el hero del launcher sube a 56px
  con un lead de 18px, el módulo createServer a 1.1fr/0.9fr, el nav a Demo · Benchmarks · GitHub
  (los tres enlaces reales: el demo server no sirve `docs/` ni `CHANGELOG.md`, que viven en la raíz
  del repo) y la stat central a «1 commit por cambio de estado».
- L12 (limite, 2026-11-04): dos elementos del artboard no son implementables sin romper el motor y
  no se copian: el título del hero a 34px (la fila del motor declara 26px, `HERO_TITLE_HEIGHT`) y el
  sidebar a 320px (el demo mide 340px porque sus secciones reales lo necesitan). El artboard es la
  especificación visual; donde el motor es dueño del layout, manda el motor.
- L13 (usuario, verbatim): "Al final quedó pegado, ojo con eso" / "Ese link no se vé." / "Sin métricas
  queda horrible" / "Estas secciones Horribles, si con h mayúscula." + "Para que sea mejor su
  interacción con un navegador, revise ego(lite) que ese navegador está basado en chromium y está
  pensado específicamente para la IA".
- L14 (medición con ego lite, 2026-11-04): los cinco defectos, medidos en el navegador y no a ojo:
  1. el tip del launcher quedaba a **0px** del final del documento (el wrapper `.launcher` existía en
     el CSS pero nunca llegó al HTML, así que su `padding-bottom` no se aplicaba);
  2. el enlace del benchmark salía con el **azul por defecto del navegador** (`rgb(0, 0, 238)`) sin
     estilo, invisible sobre la superficie oscura;
  3. con las métricas apagadas el layout **conservaba los 52px** de la barra (903px de layout en una
     ventana de 955px): una franja vacía al pie;
  4. en las vistas distintas de *core* el índice y la nota se estiraban **1910px y 1870px** en una
     medida de 960px, con el contenido flotando en medio (dos bandas atravesando la página);
  5. `h()` salía como **H()** por el `text-transform: uppercase` de las etiquetas.
- L15 (correcciones, 2026-11-04): (1) el launcher recupera su wrapper y con él los 96px de aire al
  final — el `padding-bottom` del `body` **no** servía: al propagarse el overflow al viewport no
  extiende el área scrollable, medido 0px igual; (2) los enlaces del demo llevan el azul de marca y
  un filete, en vez del azul del navegador; (3) el layout toma la altura que libera la barra de
  métricas (`body.metrics-off`); (4) el índice de las vistas no-core es una barra de dos filas —las
  cuatro pestañas y las entradas de la vista activa— y la nota del contador DOM se oculta ahí,
  porque solo existe en la vista del canvas; (5) `h()` conserva su caja con `.api-name`.
- L16 (hallazgo de cache, 2026-11-04): el servidor del demo servía los estáticos **sin cabeceras de
  caché**, y el navegador se quedaba con la hoja de estilos anterior (medido: el CSSOM del navegador
  no contenía la regla nueva mientras el servidor ya la servía). El server ahora responde
  `Cache-Control: no-store`: es un servidor de desarrollo y una hoja editada hace un segundo tiene
  que llegar al navegador.
- L17 (usuario, 2026-11-04): "El título «Índice de secciones» parece que sea una sección para hacer
  click y no lo es." En la barra de las vistas no-core la etiquetashares estilo con las pestañas:
  ahora es una leyenda (frase, apagada, separada por un filete) y las pestañas quedan como lo
  accionable.
- L18 (hallazgos hacia el motor, 2026-11-04): el trabajo de visual no encontró **bugs** del motor —
  el motor se comportó como se documentó — pero sí cuatro puntos donde el contrato con el CSS del
  consumidor es frágil. Con evidencia en `src/`:
  1. **La altura de fila no es consultable ni observable.** El texto se mide con una heurística
     (8px por carácter, factor 1.4, `src/render/engines/text-measure.ts:9-39`), nunca contra el CSS,
     y no hay aviso cuando el `line-height` del consumidor no cabe en la fila (medido: 6px de
     desborde). El valor por defecto (20) está cableado en cuatro sitios (`src/app.ts:220`,
     `src/ssr.ts:78`, `src/testing.ts:102`, `src/render/reflow.ts:44`) y no se expone: el consumidor
     lo hardcodea (el demo: `createApp(..., { lineHeight: 20 })` más su propio
     `HERO_TITLE_HEIGHT = 26`). Precedente en el propio motor: `onTransformConflict`
     (`src/app.ts:137`).
  2. **Lo que el CSS mueve no lo mide el motor.** `src/render/commit.ts:617` escribe la geometría
     sin `box-sizing` ni compensar padding/border CSS, y `layout.padding` es aritmética de layout,
     no padding CSS (`src/core/types.ts:135`, `src/render/engines/flex.ts:97`). Un `::before` no
     existe para la medición: el ancho declarado tiene que reservarlo a mano (lo aprendí al meter el
     punto de color de los chips).
  3. **Un control DOM sin hijos no tiene tamaño** (`src/render/reflow.ts:95-109`): una hoja mide 0
     salvo que declares `height`. Indicio aparte: el fast-path no aplicaría las dimensiones
     declaradas de una hoja (`src/render/engines/fast-path.ts:72-102`).
  4. **Los canales de diagnóstico están dispersos**: `onError` (`src/app.ts:333`), `console.warn` por
     estilo rechazado (`src/features/style.ts:130`), warnings de sintaxis dev
     (`src/syntax/h.dev.ts`), de hidratación (`src/render/commit.ts:344`) y de portales
     (`src/render/commit.ts:492`). Y el criterio de dev no es uniforme: la app exige `development`,
     los estilos consideran dev todo lo que no sea `production`.
  Lo que **no** es un hallazgo: el diff de `attrs` ya existe (`src/render/diff.ts:152`,
     `src/render/commit.ts:443`) —lo que sí es cierto es que mutar y reutilizar el mismo objeto
     `attrs` puede ocultar cambios por igualdad de identidad (`src/render/diff.ts:153`); y el camino
     composable de transform (`--animation-transform`) y `onTransformConflict` ya existen.
  Pendiente de decidir por el usuario: los puntos 1 y 4 tocan `src/` y **avanzan la versión**
  (regla G2 del repo); el punto 2 se resuelve documentando el contrato, sin tocar `src/`.
