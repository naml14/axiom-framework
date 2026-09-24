# Feature: create-axiom-cli-ux

> **Origen**: auditoría del CLI `create-axiom` (2026, rama `feat/create-axiom-cli-ux`).
> El scaffold publicado 0.9.13 funciona de punta a punta (7 archivos, `bun install`,
> dev server 200, render sin errores de consola), pero la **superficie de CLI** tiene
> agujeros reales medidos sobre el paquete publicado:
> 1. `create-axiom --help` y `--version` **no existen**: el primer argumento se toma
>    como nombre de proyecto y falla con `Invalid project name: "--help"`.
> 2. Si el directorio destino ya existe, el CLI **sobreescribe en silencio**: sin aviso,
>    sin backup, sin `--force`.
> 3. Hace `bun install` **siempre**: no hay forma de scaffol dear sin red.
> 4. `SAFE_NAME_RE` acepta **nombres reservados de Windows** (`con`, `nul`, `aux`,
>    `com1`…), que fallan al crear el directorio.

**Alcance**: `scripts/create-axiom.ts`, `scripts/templates/package.json`, tests del CLI
y la sección de Quick Start del `README.md`. **No se toca `src/`** ni el resto de
`scripts/`: el motor del framework no está en discusión.

## Decisiones del usuario (2026)

| # | Decisión | Elección |
| - | -------- | -------- |
| D1 | Alcance de flags | `--help`/`--version`, guard de directorio + `--force`, `--no-install`, hardening de nombres + limpieza del placeholder |
| D2 | Directorio existente sin `--force` | **Preguntar en TTY**; sin TTY (CI/pipe) **abortar** con exit 1 |
| D3 | Commits | Un work-unit commit por tarea (Conventional Commits), tests y docs junto al código |
| D4 | Ramas remotas mergeadas | No tocar el remoto |

## Contrato del CLI

```
create-axiom [project-name] [options]

  -f, --force       Sobreescribe archivos en un directorio de proyecto existente
      --no-install  Omite la instalación de dependencias
  -h, --help        Muestra el uso y sale con 0
  -v, --version     Imprime la versión de axiom-framework y sale con 0

  project-name      Directorio a crear (default: my-axiom-app)
```

Reglas de comportamiento:

- **Exit codes**: `0` éxito (y también `--help`, `--version` y cancelación explícita
  del usuario); `1` cualquier error (uso inválido, nombre inválido, directorio existente
  sin TTY, fallo de install).
- **Directorio destino**:
  - no existe → scaffold directo.
  - existe y **está vacío** → scaffold directo, sin prompt (no hay nada que sobreescribir).
  - existe y tiene contenido:
    - con `--force` → sobreescribe **solo** los archivos del template, el resto intacto.
    - sin `--force` y **con TTY** → prompt `[y/N]`; `y`/`yes` continúa, cualquier otra
      respuesta cancela sin escribir nada y sale con 0.
    - sin `--force` y **sin TTY** → error, exit 1, no escribe nada.
- **Nombres válidos**: `^[a-z0-9][a-z0-9._-]*$` (sin cambios) **más** el rechazo de
  nombres reservados de Windows (`con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9`,
  con o sin extensión) y de nombres terminados en punto o espacio. Se rechazan en todas
  las plataformas: un proyecto con esos nombres no se puede clonar en Windows.
- **Superficie programática intacta**: `scaffoldProject(projectDir, projectName)` e
  `installProjectDependencies(projectDir)` mantienen su firma; los tests existentes
  (`tests/create-axiom.test.ts`) deben seguir pasando sin cambios.
- **Sin dependencias nuevas**: parser de flags a mano.

## Cambios por tarea

### T1 — Parser de flags + `--help` / `--version` / `--no-install`

- `parseArgs(argv)` puro y exportado: defaults (`projectName: "my-axiom-app"`,
  `force: false`, `install: true`), flags cortas y largas, error de uso ante flag
  desconocido o ante más de un posicional.
- `USAGE` exportado, en inglés (artefacto técnico) y con el contrato de arriba.
- `--help` y `--version` salen con 0 antes de tocar el filesystem. La versión sale de
  `../package.json` (misma fuente que el pin del starter).
- `--no-install` omite `installProjectDependencies`.
- Tests: unitarios de `parseArgs` + proceso real (`bun scripts/create-axiom.ts …`).

### T2 — Guard de directorio destino

- `resolveExistingDirectory({ projectDir, force, isTTY, confirm })`: función de
  decisión exportada y pura con respecto al terminal (`isTTY` y `confirm`
  inyectables), para poder testear los cinco caminos sin TTY real. Devuelve un
  outcome discriminado: `proceed` (`absent` | `empty` | `forced` | `confirmed`),
  `cancel`, o `error` (`not-a-directory` | `non-interactive-exists`).
- Prompt con `node:readline/promises`; `ttyConfirm(prompt, input, output)` escucha
  `line`/`close` con un flag `settled` (ver hallazgo de EOF en la evidencia),
  en lugar de `rl.question()`.
- Tests: unitarios de la decisión + de `ttyConfirm` con streams inyectados +
  proceso real (directorio no vacío sin TTY → exit 1 y **contenido previo
  intacto**).

### T3 — Hardening de nombres + limpieza del placeholder

- `validateProjectName(name)` exportado; mensajes de error que dicen **por qué**
  (reservado de Windows) y qué hacer.
- `scripts/templates/package.json`: eliminar `"axiom-framework": "__AXIOM_FRAMEWORK_VERSION__"`
  (placeholder muerto: el código siempre lo sobreescribe). La dependencia se inyecta
  desde `getCurrentFrameworkVersion()`.
- Tests: tabla de nombres rechazados/aceptados + verificación del pin inyectado.

### T4 — Personalizar el build estático del starter

- `scripts/templates/build-static.ts` hardcodeaba `"My Axiom Site"` en el `h1` y en
  `metadata.title`: un proyecto scaffoldeado como `my-app` generaba un sitio que
  ignoraba su nombre, aunque `index.html` y `src/app.ts` sí se personalizan.
- Cambio: `{{PROJECT_NAME}}` en ambos sitios y sustitución en `scaffoldProject`,
  igual que el resto de templates. Sin tocar la estructura de la página, el
  inlining de estilos ni `minify`.
- Guard que faltaba: ningún test ejecutaba el `build-static.ts` generado (el test
  existente construye su propio componente inline). Se añade uno end-to-end con el
  fixture local de `axiom-framework`.

### T5 — Exit 1 en fallo de install

- El contrato ya exigía exit 1 ante fallo de install, pero `main()` imprimía el
  error y **seguía imprimiendo `Ready! Run:`** y saliendo con 0, así que un scaffold
  roto pasaba en CI. Comportamiento preexistente, no una regresión.
- Cambio: mensaje accionable en stderr, exit 1, y sin bloque `Ready!` cuando la
  instalación falla. Los caminos de éxito y `--no-install` quedan igual.
- Test de regresión determinista y sin red: `bunfig.toml` con
  `registry = "http://127.0.0.1:1"` y `cache = false` dentro del proyecto (el
  `cache = false` es necesario o Bun sirve el paquete desde caché).

### V1 — Verificación independiente (ejecutada) → **FAIL**

- Delegada a `gentle-ai-verify` sobre el rango commiteado `main...38d1733`, después
  de que ASSESS devolviera `risk: high` (boundary de proceso) con plan
  `independentVerifier: true`.
- Checks que pasaron: suite completa del repo **840 pass / 2 skip / 0 fail**
  (6073 expects, 3.65s); `bun run typecheck` limpio; 98 + 11 tests de create-axiom;
  dev server del proyecto generado con **200** en `/`, `/src/app.ts` y
  `/src/styles.css`; pin exacto `"axiom-framework": "0.9.13"`; inventario del
  paquete publicado con los siete archivos de template.
- Hallazgos: ver «Informe de V1» al final. Verdicto **FAIL** por T5 (alto) y T4
  (medio), más cuatro debilidades de cobertura. Ningún otro camino se traga un
  fallo en exit 0; la cancelación interactiva con exit 0 es intencional.
- Claims históricos re-ejecutados en espejos temporales con `git show`: T1 34/92 y
  679 bytes; T2 59/159 y 532 ms; T3 98/274; y los tres RED por export faltante
  reproducidos. Figuras sin estado commiteado: ver «Informe de V1».

### V2 — Re-verificación tras la ronda de arreglos

- Cerrar T4 y T5 no se hace con la palabra del writer: hace falta una verificación
  fresca sobre el candidato congelado (los commits de la ronda), incluyendo el
  camino de fallo de install, el `dist/index.html` personalizado y las cuatro
  debilidades de cobertura.

## Archivos tocados

| Archivo | Tarea |
| ------- | ----- |
| `scripts/create-axiom.ts` | T1, T2, T3, T4, T5 |
| `tests/create-axiom-cli.test.ts` (nuevo) | T1, T2, T3, T4, T5 |
| `tests/create-axiom.test.ts` | T4 (guard end-to-end del build generado) |
| `scripts/templates/package.json` | T3 |
| `scripts/templates/build-static.ts` | T4 |
| `README.md` | T1, T2 |

## Tareas

- [x] T1. Parser de flags + `--help` / `--version` / `--no-install`
- [x] T2. Guard de directorio destino (TTY / no-TTY / `--force` / directorio vacío)
- [x] T3. Hardening de nombres + limpieza del placeholder del template
- [x] V1. Verificación independiente → **FAIL** (1 alto, 1 medio, 4 de cobertura)
- [x] T4. Personalizar el build estático del starter (hallazgo medio de V1)
- [x] T5. Exit 1 en fallo de install (hallazgo alto de V1)
- [ ] V2. Re-verificación del candidato congelado tras la ronda de arreglos

## Evidencia

### T1 — Parser de flags + `--help` / `--version` / `--no-install`

- RED antes de implementar: `bun test tests/create-axiom-cli.test.ts` →
  `SyntaxError: Export named 'parseArgs' not found in module 'scripts/create-axiom.ts'`.
- GREEN: `bun test tests/create-axiom-cli.test.ts` → 34 pass / 0 fail / 92 expect().
- Sin regresión: `bun test tests/create-axiom.test.ts` → 11 pass / 0 fail (sin cambios).
- `bun run typecheck` → limpio.
- Chequeos adversariales del parent: 30 corridas de `--help` por pipe con 679 bytes
  estables en las 30 (sin truncado por `process.exit()`); `--help --version` → gana
  `--help`, exit 0; flags repetidas idempotentes; ningún directorio fugado a la raíz
  del repo.
- Correcciones del parent sobre el trabajo del writer: la aserción de `-v` compara la
  versión real (antes solo `length > 0`) y se corrigió el comentario engañoso del caso
  `--`.
- `--force` se parsea en T1 y se conecta en T2 (hasta entonces es un no-op aceptado).

### T2 — Guard de directorio destino

- RED antes de implementar: `bun test tests/create-axiom-cli.test.ts` →
  `SyntaxError: Export named 'resolveExistingDirectory' not found in module 'scripts/create-axiom.ts'`.
- GREEN: `bun test tests/create-axiom-cli.test.ts` → 51 pass / 0 fail / 151 expect() calls.
- TRIANGULATE: casos borde del prompt (path presente en el texto, formato `[y/N]`,
  respuesta vacía = cancel).
- Sin regresión: `bun test tests/create-axiom.test.ts` → 11 pass / 0 fail (sin cambios).
- `bun run typecheck` → limpio.
- Diseño: `resolveExistingDirectory({ projectDir, force, isTTY, confirm })`
  exportado y puro con respecto al terminal — `confirm` se inyecta desde `main()`
  mediante `node:readline/promises` con `rl.close()` en `finally`. Los mensajes
  viven en el caller, no en la función de decisión, así que los tests unitarios
  no se acoplan al texto del prompt.
- Cobertura por caso del contrato:
  - Caso 1 (no existe) → `proceed/absent`, `confirm` nunca se llama.
  - Caso 2 (vacío) → `proceed/empty`, `confirm` nunca se llama.
  - Caso 3 (`--force`) → `proceed/forced`, `confirm` nunca se llama.
  - Caso 4 (TTY) → `proceed/confirmed` si `confirm` devuelve `true`,
    `cancel` en cualquier otra respuesta.
  - Caso 5 (no TTY) → `error/non-interactive-exists`, `confirm` nunca se llama.
  - Path que existe y no es directorio → `error/not-a-directory` siempre
    (con o sin `--force`).
- Tests de proceso via `Bun.spawn` con `stdin: "ignore"`:
  - directorio no vacío sin TTY → exit 1, stderr nombra el directorio y `--force`,
    archivo del usuario intacto, ningún archivo de template escrito;
  - mismo directorio con `--force` → exit 0, archivo del usuario intacto,
    templates scaffoldeados, sin `node_modules`;
  - directorio vacío → exit 0 sin `--force`;
  - path que es un archivo regular → exit 1 (con y sin `--force`).
- README refinado: bloque "Quick Start (CLI)" menciona el prompt interactivo y
  la salida en no-TTY; la línea de comandos de pie deja claro que `--force`
  esquiva el prompt.

### T2 — Defecto del prompt en EOF (parent review)

- Hallazgo: `printf '' | bun scripts/create-axiom.ts` colgaba para siempre. La
  causa era doble: (a) `rl.question()` no se exportaba ni era inyectable, y
  (b) en el readline de Bun, sobre un stream no-TTY con EOF, el evento
  `close` se dispara antes de que `rl.question()` se asiente, así que un
  `Promise.race` ingenuo contra `close` también se rompe cuando hay datos
  buffereados (`"y\n"` + EOF → `close` gana, `question` nunca settle).
- RED: nuevo test `ttyConfirm > EOF on input resolves false instead of
  hanging` → `Expected: false, Received: "TIMEOUT"` (1004 ms) antes del fix;
  el `Promise.race` con `Bun.sleep(1000)` actúa como bounded guard.
- GREEN tras el fix: el helper escucha `'line'` directamente y escribe el
  prompt con `output.write(prompt)` en lugar de `rl.question(prompt)`. Asi:
  - una línea buffereada se emite como `'line'` antes que `'close'`, así que
    `"y\n"` + EOF resuelve `true`;
  - EOF sin datos solo emite `'close'`, que resuelve `false`;
  - el `finally { rl.close() }` cierra el interfaz exactamente una vez
    (idempotente sobre un interfaz ya cerrado);
  - el flag `settled` garantiza que solo uno de `'line'`/`'close'` gana.
- API: `ttyConfirm(prompt, input = process.stdin, output = process.stdout)`
  exportado. `main()` sigue pasándolo por referencia, así que los defaults
  se aplican y el gate `Boolean(process.stdin.isTTY)` no cambia.
- Tests añadidos en `tests/create-axiom-cli.test.ts` (todos bounded por
  `Promise.race([..., Bun.sleep(1000)])`):
  - `EOF on input resolves false instead of hanging`
  - `'y' answer resolves true through injected streams`
  - `'yes' answer resolves true (case-insensitive)`
  - `'Y' (uppercase) answer resolves true`
  - `'n' answer resolves false`
  - `empty answer resolves false`
  - `garbage answer resolves false`
  - `prompt text is written to the output stream`
- Resultado final: `bun test tests/create-axiom-cli.test.ts` → 59 pass /
  0 fail / 159 expect() calls. `bun test tests/create-axiom.test.ts` →
  11 pass / 0 fail. `bun run typecheck` limpio. La suite termina en
  ~540 ms: el bounded guard evita que un regresión cuelgue el runner.

### T2 — Verificación del parent (independiente de los tests del writer)

- Sondas propias sobre `ttyConfirm` exportado, con streams `PassThrough`
  inyectados (script fuera del repo): `y` / `yes` / `Y` → `true`;
  `n` / respuesta vacía / `maybe` → `false`; EOF puro → `false` en **0.7 ms**
  (antes: cuelgue hasta el timeout, exit 124); el prompt aparece en el stream
  de salida; el proceso termina solo.
- CLI real: directorio no vacío sin TTY → exit 1, stderr accionable, **cero
  archivos escritos**; path que es archivo regular → exit 1; `--force` → exit 0
  con `USERFILE.txt` del usuario intacto y templates escritos; directorio vacío
  existente → exit 0 sin prompt.
- Suites y typecheck reconfirmados por el parent: 59 + 11 pass, 0 fail.
- Limitación conocida: el camino con **terminal real** no se pudo ejecutar en
  este entorno (`winpty` falla con
  `ASSERT_CONDITION("wp != nullptr && cols > 0 && rows > 0")` al no haber
  consola). El mecanismo de readline, la lógica de decisión y el camino no-TTY
  están cubiertos; el `Ctrl+D` sobre una terminal real queda como verificación
  manual pendiente.

### T3 — Hardening de nombres + limpieza del placeholder

- RED antes de implementar: `bun test tests/create-axiom-cli.test.ts` →
  `SyntaxError: Export named 'validateProjectName' not found in module 'scripts/create-axiom.ts'`.
- GREEN: `bun test tests/create-axiom-cli.test.ts` → 98 pass / 0 fail / 274 expect()
  calls (T1+T2 baseline: 59 pass / 159 expect(); T3 añade 39 tests / 115 expect()).
- Sin regresión: `bun test tests/create-axiom.test.ts` → 11 pass / 0 fail (sin cambios).
- `bun run typecheck` → limpio.
- Cobertura por regla del contrato:
  - **Regex existente (SAFE_NAME_RE)** — unit: vacío, `..`, `.hidden`, `-leading`,
    `a/b`, `a\\b`, `--help`. Cada uno lanza `UsageError` y el mensaje nombra
    el valor. Process: `..` → exit 1, sin prefijo `Failed to create project:`,
    cero archivos en el workspace.
  - **Nombres reservados de Windows** — unit (13 casos): `con`, `CON`, `prn`,
    `aux`, `nul`, `com1`, `com9`, `lpt1`, `lpt9`, `con.txt`, `nul.log`,
    `COM1`, `LPT9.doc`. El mensaje nombra el valor y dice "reserved".
    Process: `con --no-install` → exit 1, stderr nombra `con` y dice "reserved",
    cero archivos en el workspace.
  - **No-reservados que parecen reservados** — unit: `console`, `commodity`,
    `connect` pasan sin lanzar (protege contra sobre-rechazo por prefijo).
  - **Punto o espacio al final** — unit: `my-app.`, `app.` son rechazados por el
    chequeo dedicado y el mensaje dice "trailing" + "Windows strips". El caso
    `my-app ` (con espacio) lo captura el regex existente antes — el chequeo
    dedicado es defensivo y no rompe ese comportamiento. Process:
    `my-app. --no-install` → exit 1, stderr nombra `my-app.` y la razón,
    cero archivos en el workspace.
  - **`--help` / `--version` ganando** — process: `create-axiom --help con`
    → exit 0, imprime `USAGE`, cero archivos; `create-axiom --version con`
    → exit 0, imprime la versión, cero archivos. El parser de T1 sigue
    haciendo a `--help`/`--version` cortos-circuit antes del nombre.
  - **`-- --help` rechazado como nombre** — process: `create-axiom -- -- --help`
    → exit 1, stderr nombra `--help`, sin prefijo `Failed to create project:`,
    cero archivos en el workspace. (El primer `--` lo consume `bun run`; el
    script recibe `["--", "--help"]`, parseArgs pone `--help` como projectName,
    y `validateProjectName` lo rechaza por SAFE_NAME_RE.)
  - **Pin de versión post-limpieza** — process: `create-axiom --no-install pinned-app`
    → exit 0; `package.json` generado tiene `dependencies.axiom-framework` con la
    versión exacta de la raíz, `Object.values(dependencies)` no contiene
    `__AXIOM_FRAMEWORK_VERSION__`, y `Object.keys(dependencies).sort()` es
    `["axiom-framework"]` (el objeto queda con exactamente esa clave).
  - **Nombre válido sigue funcionando** — process: `create-axiom --no-install happy-app`
    → exit 0, scaffoldea `package.json` + `index.html` + `src/app.ts`, no crea
    `node_modules` (porque `--no-install`).
- Mensajes: cada rechazo nombra el valor, dice por qué (regex / reservado /
  trailing) y muestra `my-axiom-app` como ejemplo válido. El `main()`
  captura `UsageError` antes de tocar el filesystem y emite el mensaje tal
  cual a stderr con `process.exit(1)`, así que el prefijo genérico
  `Failed to create project:` nunca aparece para nombres inválidos (sigue
  cubriendo errores inesperados en el `.catch` de más abajo).
- `USAGE`: se añadió una sola línea en la descripción de `project-name`
  (`Windows reserved device names (con, prn, aux, nul, com1-9, lpt1-9) are rejected.`).
  Los 5 tests existentes de `USAGE string` siguen pasando sin cambios.
- Sin cambios en el comportamiento ni la firma de `parseArgs`,
  `resolveExistingDirectory`, `ttyConfirm`, `UsageError`, `scaffoldProject`,
  `installProjectDependencies`, `TEMPLATE_FILES`, `getCurrentFrameworkVersion`.
  Sin dependencias nuevas. Tablas, comillas dobles, retornos explícitos y
  comentarios en inglés, igual que el resto del archivo.

### T3 — Verificación del parent (independiente de los tests del writer)

- Suites reconfirmadas por el parent: `bun test tests/create-axiom-cli.test.ts` →
  98 pass / 0 fail / 274 expect(); `bun test tests/create-axiom.test.ts` → 11 pass /
  0 fail; `bun run typecheck` limpio.
- Rechazos ejecutando el CLI real: `con`, `CON`, `con.txt`, `nul.log`, `COM1`,
  `lpt9`, `CON.TXT`, `nul.`, `my-app.`, `my-app `, `..`, `a/b` → exit 1, mensaje que
  nombra el valor y explica la razón, sin prefijo `Failed to create project:`, y
  **cero archivos escritos**. (`-lead` lo rechaza antes el parser de T1 como flag
  desconocido, que es el comportamiento correcto.)
- Anti-sobrerrechazo verificado: `com0`, `lpt0`, `com10`, `console`, `commodity`,
  `auxiliary`, `nulll` → exit 0 y scaffoldean. Comprobar `com0`, `lpt0` y `com10` es
  importante: no son nombres reservados en Windows, y un rechazo por prefijo los
  habría roto.
- Pin post-limpieza con el CLI real (`my-cool_app.v2 --no-install`): el
  `package.json` generado tiene `dependencies` = `{ "axiom-framework": "0.9.13" }`
  exactamente (igual a la versión de la raíz), `devDependencies` intactas, sin
  `node_modules` y sin rastro del placeholder.
- Nota de diseño: `name.endsWith(" ")` es defensivo. `SAFE_NAME_RE` ya rechaza
  espacios, así que esa rama solo se activaría si el regex se relajara en el futuro;
  el test correspondiente lo dice en su nombre.

## Informe de V1 (gentle-ai-verify sobre `main...38d1733`)

Verdicto: **FAIL**. Sin arreglos ni escrituras en el repo por parte del verificador.

### Hallazgos

1. **Alto — fallo de install con exit 0** (`scripts/create-axiom.ts:439-451` → T5).
   Reproducción: directorio existente con `bunfig.toml`
   (`[install] registry = "http://127.0.0.1:1"`, `cache = false`) y
   `create-axiom <dir> --force`. Observado: `ConnectionRefused downloading package
   manifest axiom-framework`, `Install failed. Run 'bun install' manually...`, y aun
   así el bloque `Ready! Run:` con exit 0. Comportamiento preexistente al feature.
2. **Medio — el build estático ignora el starter** (`scripts/templates/build-static.ts:24,36`
   → T4). Para un proyecto `smoke-app`, `dist/index.html` contiene
   `<title>My Axiom Site</title>` y `<h1>My Axiom Site</h1>`, con
   `BUILD_ASSERT { style: true, markup: false }`: los estilos y el mecanismo del
   build pasan, el marcado personalizado no. **Ningún test ejecuta el
   `build-static.ts` generado**: `tests/create-axiom.test.ts:261` importa
   `buildStatic` y construye su propio componente, y otro test solo comprueba que
   el script generado no esté vacío.

### Debilidades de cobertura (tests que afirman más de lo que prueban)

- `tests/create-axiom-cli.test.ts:321,1008`: `Bun.Glob("*")` no ve archivos ocultos,
  así que "no se escribió nada" no queda realmente establecido.
- `tests/create-axiom.test.ts:141`: el test del instalador solo comprueba `>= 0`, no
  la propagación del fallo.
- `tests/create-axiom-cli.test.ts:476`: el test bautizado "empty string" inyecta el
  booleano `false`.
- `tests/create-axiom-cli.test.ts:774`: el test "case-insensitive" alimenta `yes` en
  minúsculas, que no prueba insensibilidad a mayúsculas (una sonda `YeS` sí pasó).

### Figuras históricas no reproducibles

Observadas en el árbol de trabajo antes del fix y sin estado commiteado: el estado
intermedio de T2 (51/151), los 1004 ms del RED de EOF y los 0.7 ms de la sonda EOF
independiente del parent (la medición actual da 0.0806 ms). El `--help` de HEAD mide
986 bytes en 30 corridas, coherente con los 679 bytes históricos de T1 (el texto
creció en T2 con el párrafo del prompt). Re-ejecutado en espejos temporales y **sí**
reproducido: T1 34/92 y 679 bytes; T2 59/159 y 532 ms; T3 98/274; y los tres RED por
export faltante (`parseArgs`, `resolveExistingDirectory`, `validateProjectName`).

### TTY: UNPROVEN

Con `COLUMNS=120`, `LINES=40`, `TERM=xterm`:

- `winpty -Xplain <bun> run <script> …` → exit 1, `stdin is not a tty` (no se asigna pty).
- `winpty -Xallow-non-tty …` y las flags combinadas → exit 3, el exacto
  `ASSERT_CONDITION("wp != nullptr && cols > 0 && rows > 0")`, incluso forzando el tamaño.

Cubierto: `ttyConfirm` con streams inyectados, `resolveExistingDirectory` con
`isTTY`/`confirm` inyectados y el camino no-TTY de proceso. **Pendiente de verificación
manual en una terminal real**: el prompt `[y/N]` y Ctrl+D.

### Limpieza y estado del repo

- Todos los árboles temporales se borraron salvo
  `C:/Users/Andres/AppData/Local/Temp/axiom-tty-VIZujv`, que queda con `EBUSY`. La
  inspección con `Get-CimInstance Win32_Process` filtrada por `winpty`/`winpty-agent`
  no encontró procesos atribuibles, así que **no se terminó ningún proceso**.
- El repo quedó con los mismos tres paths sucios preexistentes (`.atl/.skill-registry.cache.json`,
  `.atl/skill-registry.md`, `.gitignore`), que son artefactos locales del parent.
- Corregido en este informe: el documento llamaba `decideExistingDirectory` a la
  función de T2; su nombre real es `resolveExistingDirectory`.
