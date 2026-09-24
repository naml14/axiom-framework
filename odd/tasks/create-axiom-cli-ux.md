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
- [ ] T2. Guard de directorio destino (TTY / no-TTY / `--force` / directorio vacío)
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