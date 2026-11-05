# Commits que pueden avanzar la versión

El guard **Release scope guard** revisa cada commit no merge del rango, no el diff agregado. Rechaza `feat`, `fix` o un cambio breaking (`!`, `BREAKING CHANGE:` o `BREAKING-CHANGE:`) que no cambie archivos bajo `src/`. Un commit del mismo PR que sí cambia `src/` no justifica otro `fix(demo):` aislado.

```sh
bun run scripts/validate-release-scope.ts --base <ref> [--head <ref>]
bun run scripts/validate-release-scope.ts --help
```

`--base` es obligatorio; `--head` usa `HEAD`. Ambos deben resolver a commits y la base debe ser ancestro del head. El comando es de solo lectura: no cambia archivos, índice, historial ni contadores persistentes. Sale con `0` si el rango es válido, y `1` si hay commits rechazados o entrada/historial inválidos. Requiere historial completo.

- `feat(src): ...` con cambios en `src/`: permitido.
- `chore(demo): ...`, `docs(odd): ...`, `test: ...`, `ci: ...`: permitidos sin cambios breaking.
- `fix(demo): ...` sin cambios en `src/`: rechazado; el diagnóstico muestra SHA, asunto, archivos y tipos alternativos.
- `chore(main): release ...`: excluido para release-please.

CI ejecuta el guard en PR y push; calcula la base común y conserva los SHA de los eventos como datos, nunca como código shell. El check es bloqueante cuando falla, pero exigirlo en protección de ramas es una decisión del mantenedor. No se cambian automáticamente las reglas de GitHub.

Este guard cubre los tipos solicitados por S7; no redefine todas las reglas de release-please. Por ejemplo, `perf` también puede producir una versión según la configuración existente y no se incorpora aquí sin ampliar el alcance.

## La puerta de entrada a `main`

`main` no se fusiona con un clic: exige una **revisión escrita del mantenedor**
(`naml14`) sobre el commit exacto que se va a fusionar.

El código de este repositorio lo escribe el arnés de IA bajo la cuenta del
mantenedor. GitHub no permite que el autor de un pull request apruebe su
propio pull request (`Review Can not approve your own pull request`), así que
la regla de «una revisión aprobatoria» no se podía cumplir sin un bypass de
administrador. La puerta se expresa por eso como un **estado de commit**,
`Maintainer review`, y no como un conteo de aprobaciones: en el ruleset
`Main Protection`, `required_approving_review_count` es `0` y
`Maintainer review` es un check requerido.

```sh
bun run scripts/validate-maintainer-review.ts --pr <n> [--publish]
bun run scripts/validate-maintainer-review.ts --help
```

El verificador acepta la revisión solo cuando la escribió el mantenedor
(el dueño del repositorio), tiene cuerpo escrito, se hizo contra el SHA de
cabeza del pull request, no está descartada ni es un borrador, y no tiene
cambios solicitados. Una revisión de otra cuenta —Sourcery, por ejemplo— no
abre la puerta.

Con `--publish` publica el veredicto como estado `Maintainer review` en el SHA
de cabeza. El estado va atado a un commit: si el arnés empuja después, el
estado deja de aplicar y `main` vuelve a quedar cerrado hasta que se revise el
nuevo head. Es a propósito, la revisión corresponde al diff final.

El arnés redacta el texto de la revisión a partir de la evidencia de la
sesión, el mantenedor lo aprueba y el arnés lo publica. **El arnés nunca
publica una revisión sin esa aprobación.**

El estado se publica a mano, después de la revisión: si nadie lo publica, el
pull request queda bloqueado. La puerta falla cerrada, nunca de contrabando.

## Flujo de publicación

La publicación a npm pasa por dos barreras, y ambas son obligatorias:

1. **El tag manda.** El job de publicación hace checkout del tag de release
   (`axiom-framework-v<versión>`), no del commit que disparó el workflow. Antes de
   publicar, `scripts/validate-release-version.ts` comprueba que el tag existe,
   que el HEAD es el commit etiquetado y que `package.json`, el manifest de
   release-please y el CHANGELOG nombran la misma versión. La publicación manual
   (`publish.yml`) exige el tag como entrada y usa el mismo validador.
2. **El entorno protegido.** Ambos publicadores publican con `environment: npm`,
   que tiene revisores obligatorios: el token de publicación solo se emite tras la
   aprobación. Un run manual sin aprobación se queda esperando.

El build que se publica es reproducible: `bun.lock` está versionado, las
instalaciones usan `bun install --frozen-lockfile`, Bun (1.4.4) y Node (24) están
fijados, y `prepublishOnly` ejecuta typecheck, tests y build antes de subir nada.

Las acciones de CodeQL están fijadas por SHA igual que el resto, y cada job tiene
`timeout-minutes` y cada workflow un grupo de `concurrency`.
