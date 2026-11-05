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
