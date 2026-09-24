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

- `decideExistingDirectory({ dir, force, isTTY, confirm })`: función de decisión pura
  con `confirm` inyectable, para poder testear los tres caminos sin TTY real.
- Prompt con `node:readline/promises` sobre `process.stdin`/`process.stdout`.
- Tests: unitarios de la decisión + proceso real (directorio no vacío sin TTY →
  exit 1 y **contenido previo intacto**).

### T3 — Hardening de nombres + limpieza del placeholder

- `validateProjectName(name)` exportado; mensajes de error que dicen **por qué**
  (reservado de Windows) y qué hacer.
- `scripts/templates/package.json`: eliminar `"axiom-framework": "__AXIOM_FRAMEWORK_VERSION__"`
  (placeholder muerto: el código siempre lo sobreescribe). La dependencia se inyecta
  desde `getCurrentFrameworkVersion()`.
- Tests: tabla de nombres rechazados/aceptados + verificación del pin inyectado.

### V1 — Verificación

- `bun test tests/create-axiom.test.ts tests/create-axiom-cli.test.ts` (0 fail).
- `bun run typecheck`.
- Smoke real end-to-end del CLI local: scaffold en temporal, `--no-install`, arranque
  del dev server y `fetch` a `/`, `/src/app.ts`, `/src/styles.css`.

## Archivos tocados

| Archivo | Tarea |
| ------- | ----- |
| `scripts/create-axiom.ts` | T1, T2, T3 |
| `tests/create-axiom-cli.test.ts` (nuevo) | T1, T2, T3 |
| `scripts/templates/package.json` | T3 |
| `README.md` | T1, T2 |

## Tareas

- [x] T1. Parser de flags + `--help` / `--version` / `--no-install`
- [x] T2. Guard de directorio destino (TTY / no-TTY / `--force` / directorio vacío)
- [ ] T3. Hardening de nombres + limpieza del placeholder del template
- [ ] V1. Verificación completa (tests, typecheck, smoke end-to-end)

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