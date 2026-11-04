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
