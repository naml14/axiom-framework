# Feature: sourcery-review-resolution — resolver los 20 hallazgos de sourcery-ai en la cadena WU1-WU4

Feature de hardening CRÍTICO: el bot `sourcery-ai` dejó 20 comentarios de revisión en los 4 PRs
pendientes de la cadena `axiom-next-version` (PRs #120, #121, #122, #123). Cada hallazgo se
resuelve con un fix verificable en su rama, y cada hilo se responde y se marca resuelto con
evidencia (SHA del commit + test que lo pinea).

## Specs

- S1. «necesito que revise los comentarios hechos por "sourcery-ai"» — los 20 hilos de
  `sourcery-ai[bot]` en PRs #120, #121, #122 y #123 deben revisarse uno por uno.
- S2. «también tiene que resolver cada comentario que deje y me tiene que dejar evidencia de que
  resolvió esa conversación» — cada hilo cerrado con: (a) fix en código con test que lo pinea,
  (b) respuesta en GitHub quoting el commit, (c) hilo marcado `isResolved: true`,
  (d) registro durable en `odd/evidence/`.
- S3. «Si quiere por medio de ego o por gh, de la forma que consuma menos tokens y que sea la
  mejor para sacar las conclusiones correctas» — vía `gh api` / GraphQL (menor consumo, acceso
  directo a los hilos y a `resolveReviewThread`).
- S4. Restricción heredada de la cadena: los fixes se aplican en la rama que origina el código
  señalado, de modo que cada PR conserva su diff revisable y la pila sigue apilable en orden
  WU1 → WU2 → WU3 → WU4.
- S5. No se toca `src/app.ts` fuera de lo que el propio PR #121 introduce, ni se altera el
  contrato público (`validate:api` debe seguir en 0 untagged / 0 deprecated).

## Hallazgos por PR (20 total)

### PR #120 — `feat/next-version-01-release-integrity` (10)

| ID | Sev | Archivo | Hallazgo | Decisión técnica |
| --- | --- | --- | --- | --- |
| S120-A | High | `.github/workflows/ci.yml:40` | El guard nunca corre en los PRs del bot: `GITHUB_TOKEN` no dispara el evento `pull_request` | CI: añadir job `release-notes-guard` disparado por `workflow_dispatch` desde el propio workflow de release-please, más un job en `push` a `release-please--*`. Verificado empíricamente: el run `38952332592` existe con `event=pull_request` pero 0 jobs |
| S120-B | Medium | `scripts/validate-release-notes.ts:289` | Errores de Git producen salida limpia | Distinguir exit 1 (`merge-base` no ancestro) de >1 (error) y de `git diff` fallido; fallar el guard |
| S120-C | Medium | `scripts/validate-release-notes.ts:277` | SHA ambiguo evade la detección | Exigir que el prefijo resuelva a exactamente 1 commit del rango; error explícito si no |
| S120-D | Medium | `scripts/validate-release-notes.ts:296` | Reverts de rename evaden el guard | Usar `--name-status -M` e incluir ambos paths de cada rename |
| S120-E | Medium | `scripts/validate-release-notes.ts:66` | Flags mal escritos revisan otro rango | Rechazar argumentos CLI no reconocidos antes de resolver refs |
| S120-F | Medium | `scripts/validate-release-notes.ts:128` | Rangos invertidos pasan como limpios | Verificar que base sea ancestro de head; error si no |
| S120-G | Medium | `scripts/validate-release-notes.ts:321` | Features restauradas se marcan fantasma | Considerar reverts posteriores (revert de un revert restaura la feature) |
| S120-H | Medium | `scripts/validate-release-notes.ts:341` | Entradas válidas se marcan fantasma | Determinar si el revert elimina realmente el cambio enlazado, no por ancestro + path compartido |
| S120-I | Medium | `scripts/validate-release-notes.ts:333` | El padre del revert se confunde con el objetivo | Identificar el commit revertido real (patch-id / primer padre correcto del commit revertido) |
| S120-J | Medium | `scripts/validate-release-notes.ts:318` | Entradas con el mismo asunto se marcan mal | Asociar el revert al commit enlazado que deshace, no solo por asunto |

### PR #121 — `feat/next-version-02-promises` (6)

| ID | Sev | Archivo | Hallazgo | Decisión técnica |
| --- | --- | --- | --- | --- |
| S121-A | Medium | `src/features/style.ts:268` | Estilos no confiables provocan requests externos | `backgroundImage` es whitelisted y acepta `url()`; sanear el valor también en producción (allowlist de `data:` de `attrs.ts`) |
| S121-B | Medium | `src/features/style.ts:268` | `attrs.style` evade la whitelist | `attrs.style` es escape hatch de atributos crudos: aplicarle la misma validación de whitelist en dev |
| S121-C | High | `src/app.ts:467` | El layout responsive queda stale | El handler de `resize` refresca `cachedConstraints` pero no programa `performUpdate()`; programar update + `ResizeObserver` del root |
| S121-D | Medium | `src/features/style.ts:268` | Estilos borrados conservan el valor previo | Valor `''` en key whitelisted debe limpiar el valor CSS aplicado y aun así advertir |
| S121-E | Medium | `src/render/commit.ts:121` | Lecturas de layout en updates | `applyFrameworkLayout` lee `el.style.transform` / `getPropertyPriority` en `applyOps`; evitar la lectura CSSOM en la ruta de update |
| S121-F | Medium | `tests/architecture/hot-path-dom-reads.test.ts:108` | Lecturas en plantillas evaden el scan | `stripCommentsAndStrings` vacía plantillas completas; enmascarar texto preservando `${...}` |

### PR #122 — `feat/next-version-03-contract` (3)

| ID | Sev | Archivo | Hallazgo | Decisión técnica |
| --- | --- | --- | --- | --- |
| S122-A | Medium | `src/ssr.ts:344` | Las requests SSR se bloquean | `escapeStyleText` hace split/join por cada URL preservada → O(n²); restaurar marcadores en una sola pasada |
| S122-B | Low | `docs/STABILITY.md:165` | El doc generado pierde la política | El generador reescribe el doc sin la sección de política de promoción; incluirla en la plantilla del generador |
| S122-C | Medium | `tests/ssr.test.ts:482` | El test de tiempo falla bajo carga | `expect(elapsed).toBeLessThan(500)` es dependiente de la máquina; sustituir por aserción de correctitud + techo generoso |

### PR #123 — `feat/next-version-04-demo` (1)

| ID | Sev | Archivo | Hallazgo | Decisión técnica |
| --- | --- | --- | --- | --- |
| S123-A | Medium | `demo/router-demo.ts:31` | El encabezado principal sigue recortado | `HeroCard` en `demo/components.ts` renderiza 26px en la fila default de 20px; darle `height: HERO_TITLE_HEIGHT` |

## Tasks

| ID | Spec | Trabajo | Ruta | Rama |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | Resolver S120-A..S120-J (10 hallazgos del guard) | worker | `feat/next-version-01-release-integrity` |
| T2 | S1, S2 | Resolver S121-A..S121-F (6 hallazgos de core) | worker | `feat/next-version-02-promises` |
| T3 | S1, S2 | Resolver S122-A..S122-C (3 hallazgos de contrato) | worker | `feat/next-version-03-contract` |
| T4 | S1, S2 | Resolver S123-A (1 hallazgo de demo) | worker | `feat/next-version-04-demo` |
| T5 | S2, S5 | Verificar: `bun test`, `bun run typecheck`, `bun run validate:api`, `bun run validate:release-notes` por rama | inline | todas |
| T6 | S4 | Propagar los fixes por la pila (merge WU1→WU2→WU3→WU4) y pushear | inline | todas |
| T7 | S2, S3 | Responder y resolver los 20 hilos con evidencia; registrar en `odd/evidence/sourcery-review/` | inline | — |

## Log

- L1 (usuario, verbatim): «Ok, vamos a revisar esos PRs. En github tengo un bot que revisa cada PR
  hecho, así tengo otra opinión, necesito que revise los comentarios hechos por "sourcery-ai".
  Si quiere por medio de ego o por gh, de la forma que consuma menos tokens y que sea la mejor
  para sacar las conclusiones correctas para su correcta resolución de los comentarios hechos,
  también tiene que resolver cada comentario que deje y me tiene que dejar evidencia de que
  resolvió esa conversación.»
- L2 (usuario, verbatim): «retome el trabajo y el rebase se demoró mucho, lo más seguro es que no
  está funcionando la versión de comandos.»
- D1 (decisión): el rebase de la cadena se completa con `GIT_EDITOR=true` — la demora anterior fue
  el editor Vim esperando input de terminal, no un fallo del rebase. Verificado: las 4 ramas
  rebasean sobre `main` (298978e) con el conflict de `backlog-pendientes.md` resuelto tomando la
  versión de `main` (que ya cierra R1).
- D2 (decisión): el hallazgo S120-A se confirma empíricamente antes de tocar CI — el run
  `38952332592` del PR de release-please tiene `event=pull_request` pero conclude `failure` con
  0 jobs ejecutados, lo que confirma que el guard no llega a correr en los PRs del bot.
- D3 (decisión): los fixes se aplican en la rama que introduce el código señalado (S4), y luego se
  propagan hacia abajo en la pila para que cada PR siga siendo mergeable en orden.
