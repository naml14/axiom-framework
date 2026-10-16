# Feature: release-0.9.14-verification — ¿es correcto mergear PR #118?

Fecha: 2026-10-16 · Alcance: verificación de solo lectura + evidencia de navegador sobre el
head exacto del PR (`fe0e1be`). **No se modificó código del framework ni del demo.**

## Specs

- S1. «revise si los estados del repositorio de github es correcto, si necesita que inicie sesión avise.»
- S2. «lo que tiene que hacer es comprobar si es correcto hacer ese merge y ver si cumple todo lo que dice el changelog, obviamente antes de eso tiene que verificar no solo corriendo los test si no también comprobando el demo. Si necesita instalar el MCP de Playwrigth para eso o usar otro MCP pues haga lo necesario para tener una evidencia extremadamente sólida para que las releases del proyecto sean lo más correctas posibles.»
- S3. Limpieza autorizada por el usuario: «Remotas + locales (requiere login)» (borrar ramas remotas ya mergeadas, ramas locales fusionadas y corregir el upstream engañoso).

## Veredicto

**NO es correcto mergear PR #118 tal como está.** El candidato es técnicamente sano (todos los
chequeos pasan) pero es **funcionalmente idéntico a v0.9.13** y su CHANGELOG afirma dos
Features que el código **no contiene** (fueron revertidas por PR #117). Mergearlo publicaría un
0.9.14 gemelo de 0.9.13 con un changelog falso. Ver §6 para las dos salidas correctas.

## 1. Qué contiene el PR y qué afirma su CHANGELOG

- PR #118 (release-please), head `fe0e1be`, 3 archivos: `.release-please-manifest.json`,
  `CHANGELOG.md`, `package.json` (+10/−2). `mergeable: true`, `mergeable_state: unstable`.
- CHANGELOG 0.9.14 lista dos Features:
  - `create-aviom: add --help, --version and --no-install flags (62062aa)`
  - `create-axiom: add --help, --version and --no-install flags (2681565)`
- En el head del PR, `scripts/create-axiom.ts` tiene **0 coincidencias** de `--help`,
  `--version` y `--no-install`; en el commit revertido `2681565` tenía 3/2/3.
- Ejecución real del CLI en el head del PR (directorio de scratch):
  - `create-axiom --help` → `error: Invalid project name: "--help". …` exit **1**, sin crear directorios.
  - `create-axiom --version` → idem, exit **1**.
  - `create-axiom --no-install` → idem, exit **1**.
- Causa: release-please no interpreta `Revert "…"` como commit convencional, así que el revert
  `19f56c8` no aparece en el changelog y las entradas del feature quedan como si el código existiera.

## 2. Prueba diferencial: 0.9.14 ≡ 0.9.13 en comportamiento

`git diff axiom-framework-v0.9.13 fe0e1be` → solo los 3 archivos de metadatos de release.
Hashes de objeto Git de los subárboles (idénticos ⇒ imposible que cambie el runtime):

| Subárbol | v0.9.13 | head PR #118 |
| --- | --- | --- |
| `src` | `335f33c35f793116989fe3d4ea22b8602c887117` | `335f33c35f793116989fe3d4ea22b8602c887117` |
| `demo` | `35fdb7539f1b60c6b8f574b6a1a597dab440a2b4` | `35fdb7539f1b60c6b8f574b6a1a597dab440a2b4` |
| `tests` | `880830cc8a8c82cefb70ff03ea43126013c0e222` | `880830cc8a8c82cefb70ff03ea43126013c0e222` |
| `scripts` | `9e1fff9ef2e1e3d14ddadab2fe51012853e0e9d1` | `9e1fff9ef2e1e3d14ddadab2fe51012853e0e9d1` |

Consecuencia: cualquier hallazgo de navegador de este documento es **preexistente en 0.9.13**,
no una regresión de 0.9.14.

## 3. Chequeos estáticos sobre el head del PR (worktree aislado `.verify-tmp/pr118`)

| Chequeo | Resultado |
| --- | --- |
| `bun run typecheck` | 0 errores |
| `bun test` | 742 pass / 2 skip / 0 fail (39 archivos). Los 2 skips: limitación conocida de `happy-dom` con `select.value` |
| `bun run test:coverage` | PASS, 95.06 % líneas vs umbral 85 % |
| `bun run validate:api` | PASS, 137 exports (132 stable, 5 experimental, 0 deprecated, 0 untagged) |
| `bun run build` | OK (`dist/` generado) |
| `bun run demo:build` | OK (bundle + sitio estático) |
| `npm pack --dry-run` | `axiom-framework-0.9.14.tgz`, 208 archivos, 225.7 kB |

## 4. Evidencia de navegador (Chromium real vía Playwright 1.64.1, headless)

Scripts: `odd/evidence/release-0.9.14/scripts/` (`verify-demo.ts`, `diag.ts`, `zoom.ts`,
`probe-padding.ts`; se ejecutan con `bun` y Playwright, contra el demo servido desde un worktree
en el head del PR).
Reportes: `odd/evidence/release-0.9.14/report.json`, `report.md`, `diagnostic.json`.
Capturas: `odd/evidence/release-0.9.14/shots/` (20 PNG, incluidas 6 de zoom).
Primera pasada: **34/39 PASS**. Los 5 FAIL se diagnosticaron todos (§5): 1 era falso positivo
del propio script (forms) y 4 son defectos cosméticos preexistentes del demo.

### 4.1 Capa HTTP (todas las rutas con cabeceras de seguridad completas)

| Ruta | Estado | Contenido |
| --- | --- | --- |
| `/` | 200 | launcher presente |
| `/static.html` | 200 | roots de Context y Forms presentes |
| `/ssr?name=Dev&width=960&root=ssr-root` | 200 | marcadores `data-axiom-id` y nombre inyectado |
| `/ssr?name=Dev&width=720&root=ssr-root` | 200 | marcadores presentes |
| `/ssr-stream` | 200 + `transfer-encoding: chunked` | root de streaming presente |
| `/style.css`, `/app.js` | 200 | payload real |
| `/does-not-exist` | 404 | — |

- Preflight CORS: `OPTIONS /ssr` con `Origin: http://localhost:3000` → 204 y
  `access-control-allow-origin` correcto; con `Origin: http://evil.example` → 204 **sin** ese
  header (origen no permitido).
- Traversal: `/../package.json`, `/..%2fpackage.json`, `/%2e%2e/package.json`, `/../.env` →
  sin fuga (403/404, nunca 200 con contenido).
- SSR hostil: `/ssr?name=<img src=x onerror=alert(1)>` → HTML escapado (`&lt;img`), **0** nodos
  `<img>` inyectados en `#ssr-root`.

### 4.2 SSR / streaming (invariantes de `demo-ui-polish`)

| Página | padding computado | gap arriba/abajo | márgenes izq/der | `data-axiom-id` | chip |
| --- | --- | --- | --- | --- | --- |
| `/ssr?width=960` | 24px | 25 / 25 px | 240 / 240 | 17 | 2px 8px |
| `/ssr?width=720` | 24px | 25 / 25 px | 360 / 360 | 17 | 2px 8px |
| `/ssr-stream` | 24px | 25 / 25 px | 324 / 324 | 15 | 2px 8px |

### 4.3 Interacción en `/static.html`

- 11/11 roots Axiom montados con hijos.
- Clic en los **46 botones con id**: sin errores nuevos de página ni de consola en ninguno;
  los 2 botones de error intencional (`#dx-error-test`, `#ruta-b-error-run`) llenaron sus
  sobres de error (`#dx-error-output`, `#ruta-b-error-output`) como corresponde.
- Sliders: `#width-slider` (320/800/1400) y `#items-slider` (5/20/60) reactivos, displays
  actualizados en cada paso.
- Router demo: 8 navegaciones (`home`, `about`, `users`, `user-2`, `404`, `back`, `forward`,
  `replace`) con salidas distintas en `#router-output`.
- Portal: abre dentro de `#portal-modal-root`, desmonta al cerrar.
- Forms (check corregido, 2 campos + regla asíncrona): caso inválido → exactamente 1 estado
  `form-status--invalid` con «✗ Invalid email format»; caso válido → 0 inválidos, 2 válidos y
  los `<code>` reflejan el binding (`username = "ada_lovelace"`, `email = "dev@axiom.local"`).
- Higiene: **0** errores de página, **0** peticiones fallidas; los únicos 2 mensajes de consola
  son los errores intencionales del panel DX durante sus pasos esperados.
- Viewports 768 y 1440 px: sin overflow horizontal del documento.

## 5. Hallazgos preexistentes del demo (NO regresiones de 0.9.14; ver §2)

1. **Tarjetas Syntax recortadas 10 px** (`#syntax-h-v2-root`, `#syntax-h-literal-root`).
   Causa: la regla CSS `.syntax-panel > div:last-child { padding: 10px }` da padding al *host*
   del árbol Axiom; el motor posiciona el hijo absoluto en `(10,10)` pero lo dimensiona al
   border-box del host (143×120 en vez de 122.5×100). Visible en
   `shots/zoom-syntax-h-v2.png`: el texto «Same tree. Less nois…» queda cortado. Viola la regla
   ya documentada en `odd/tasks/demo-ui-polish.md` («el padding lo declara el motor, no el CSS»).
2. **Canvas del Grid MVP demasiado corto** (`demo/ruta-b-showcase.ts:67`, `height: 160`):
   el contenido mide 196 px ⇒ 36 px fuera y 4 celdas absolutas (`C`, `D` y sus labels) pintadas
   fuera del root. Captura `shots/zoom-grid-mvp.png`.
3. **Títulos de 20 px con texto de 26 px**: `h2.hero-title` de la ruta 404 del router y de la
   sección Portal desbordan 6 px su fila (`shots/zoom-router-404.png`, `zoom-portal.png`).
4. **390 px de ancho**: 14 px de overflow horizontal del documento; el canvas `#app` mide 800 px
   (valor del slider) y `.dashboard-main` no encoge por debajo de su contenido. Limitación del
   demo de escritorio, no del framework (`shots/06-static-390.png`).
5. **CLI: exit code 0 pese a fallo de instalación** (head del PR y `main` por igual).
   `create-axiom probe-app` scaffoldea, pinea `"axiom-framework": "0.9.14"` (inexistente en npm
   antes de publicar), `bun install` falla con `No version matching "0.9.14" found`, y aun así
   el proceso termina con **exit 0** e imprime «Ready! Run: cd probe-app; bun dev». Es el ítem
   «install exit code» del issue abierto **#96**.

## 6. Estado de GitHub y salida correcta para PR #118

- `origin/main` = `e3a8654` = `main` local; CI/Security/Release-Please de `main` en verde.
- PR #118 abierto; sus corridas CI y Security sobre `fe0e1be` están en **`action_required`**
  (nunca arrancaron: esperan aprobación manual en Actions). Único check ejecutado: Sourcery ✅.
  La corrida previa sobre el head anterior `73ecf14` (con el feature sin revertir) fue `failure`.
- npm: `dist-tags.latest = 0.9.13` (publicado 2026-09-23T20:49Z, ~2 min tras el release de
  GitHub) ⇒ el trusted publisher OIDC (U1 de `npm-oidc-trusted-publishing.md`) funciona.
  0.9.14 no existe en npm.
- Issues abiertos: #96 (endurecer el CLI; su implementación fue revertida) y #30 (EPIC v1.0.0).
- Lecturas que exigen autenticación (`gh auth login`): aprobar/cancelar los runs
  `action_required`, cerrar o editar PR #118, borrar su rama, y leer la branch protection de
  `main` (la API devolvió 401). Con las credenciales de git actuales (credential.helper=manager)
  sí se pueden borrar ramas remotas.

Salidas correctas (decisión del mantenedor):

- **A (recomendada).** Cerrar PR #118 y borrar su rama. Como no se crea tag, el próximo release
  PR de release-please volverá a arrastrar las dos entradas fantasma: editar su `CHANGELOG.md`
  en la rama del PR antes de mergear (release-please respeta ediciones manuales).
- **B.** Editar ahora el `CHANGELOG.md` de la rama de release (quitar las 2 Features o
  sustituirlas por una nota del revert), aprobar los runs y mergear: publica un 0.9.14 honesto
  pero gemelo de 0.9.13 (gasta un número de versión y un publish).

**Decisión del mantenedor (2026-10-16): opción A.** PR #118 cerrado sin mergear mediante la API
de GitHub (token de las credenciales git almacenadas, scopes `repo`) con un comentario que
explica el motivo, y rama remota `release-please--branches--main--components--axiom-framework`
eliminada. Pendiente operativo: cuando release-please abra el siguiente release PR, editar su
`CHANGELOG.md` en la rama del PR antes de mergear.

En ambos casos, registrar los hallazgos del §5 como follow-ups (no bloquean la release).

## Tareas

- [x] T1. Comparar el contenido del head del PR con lo que afirma su CHANGELOG (S2).
- [x] T2. Chequeos estáticos sobre el head exacto del PR en worktree aislado (S2).
- [x] T3. Evidencia de navegador con Chromium real: HTTP, SSR, interacción, higiene (S2).
- [x] T4. Diagnóstico de los 5 FAIL de la primera pasada y prueba diferencial v0.9.13 (S2).
- [x] T5. Este documento de evidencia (S2).
- [x] T6. Limpieza de ramas autorizada (S3): 4 remotas mergeadas, 2 locales fusionadas y
      pasar de `chore/revert-create-aviom-merges` a `main`.
- [x] T7. Decisión del mantenedor sobre PR #118: **opción A** (cerrar sin mergear y borrar la
      rama), ejecutada vía API de GitHub sin necesidad de `gh auth login`.
- [x] T8. Evidencia y scripts movidos a `odd/evidence/release-0.9.14/` y commiteados con este
      documento (S: «todo lo del odd se debe hacer commit»).

## Log

- L1 (usuario, verbatim): «revise si los estados del repositorio de github es correcto, si necesita que inicie sesión avise.»
- L2 (usuario, verbatim): «lo que tiene que hacer es comprobar si es correcto hacer ese merge y ver si cumple todo lo que dice el changelog, obviamente antes de eso tiene que verificar no solo corriendo los test si no también comprobando el demo. Si necesita instalar el MCP de Playwrigth para eso o usar otro MCP pues haga lo necesario para tener una evidencia extremadamente sólida para que las releases del proyecto sean lo más correctas posibles.»
- L3 (usuario, verbatim, opción de limpieza): «Remotas + locales (requiere login)».
- D1 (decisión): se verificó sobre el head exacto del PR en un worktree aislado
  (`.verify-tmp/pr118`, excluido de git) y no sobre `main`, para que la evidencia corresponda al
  candidato de release y no al árbol de desarrollo.
- D2 (decisión): Playwright se instaló en `.verify-tmp/pw` (fuera de `package.json` y
  `bun.lock` del repo) para no contaminar el candidato con dependencias nuevas.
- D3 (decisión): el check de forms de la primera pasada era un falso positivo del script (solo
  llenaba el email); se corrigió a 2 campos + esperas de la regla asíncrona y pasó.
- L4 (usuario, verbatim): «1. opción A\n2. Ok\n3. todo lo del odd se debe hacer commit».
- D4 (decisión): la evidencia (reportes, diagnóstico y 20 capturas) y los 4 scripts de
  verificación se movieron de `.verify-tmp/` a `odd/evidence/release-0.9.14/` para que la
  verificación sea reproducible desde el repositorio.
- D5 (decisión): el cierre de PR #118 y el borrado de su rama se hicieron con el token de las
  credenciales git almacenadas (credential.helper=manager, scopes `gist, read:org, repo,
  workflow`), consumido por script sin imprimirlo; `gh` sigue sin sesión interactiva.
