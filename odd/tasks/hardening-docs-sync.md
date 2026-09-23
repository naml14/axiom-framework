# Feature: hardening-docs-sync

> **Origen**: `integration/hardening-good-rollup` reúne 15 de los 16 desarrollos del
> rollup de hardening (excluye `perf/signals-notify-no-alloc`, que congelaba el demo).
> La documentación quedó describiendo un estado que ya no es el real.
> **Fecha**: 2026-09-22
> **Alcance**: solo documentación y JSDoc existente. No se toca `src/` en esta pasada,
> para no invalidar el commit verificado `023d5e3`.

## Contexto

Desarrollos entregados en la rama (15 merges): cobertura del demo (Fase 0), seguridad y
correctness (F1-T1 a F1-T7), y hot-path perf (F2-T1 a F2-T6, F2-T8). **No** entregado:
F2-T7 (`perf/signals-notify-no-alloc`), excluido por defecto propio; y toda la Fase 3.

## Tareas

- [x] T1. `odd/tasks/axiom-hardening-plan.md`: registrar el estado real de ejecución
  (entregado, excluido, pendiente), el motivo verificado de la exclusión de F2-T7 y
  los criterios de reapertura.
- [x] T2. `odd/tasks/axiom-hardening.md`: banner de estado hacia el resultado, sin
  reescribir el catálogo histórico de hallazgos.
- [x] T3. `SECURITY.md`: alinear la política de URL schemes con la implementación real
  (allowlist de `data:` de medios + SVG solo base64) y documentar la asimetría con el
  SSR inline-style.
- [x] T4. `docs/ARCHITECTURE.md`: incorporar `src/render/diff-scratch.ts` a la sección de
  memory pooling (módulo nuevo del hot path).

## Decisiones de esta pasada

- **`CHANGELOG.md` no se edita**: lo genera release-please (marcador explícito en el
  archivo y sin sección *Unreleased*). Los mensajes convencionales de los merges son la
  entrada.
- **`docs/STABILITY.md` no se edita**: `bun run validate:api` pasa en la rama
  (137 exports, 132 stable, 5 experimental, 0 deprecated); no hay drift que corregir.
- **`src/` no se toca**: el commit certificado `023d5e3` conserva su hash. El comentario
  de invariante en `notifySubscribers` y el test de regresión quedan como propuesta
  separada (`hardening-docs-sync` → tarea abierta T5, más abajo).

## Pendientes detectados (no bloquean la rama)

- **T5 (propuesta)**. Comentario de invariante en `src/reactivity/signals.ts` y test de
  regresión que convierta el cuelgue en fallo rápido (ver F2-T7 en el plan).
- **T6 (decisión del mantenedor)**. `resetIndexCounter` está marcado `@deprecated` en
  `src/render/prepare.ts` pero **no** se re-exporta en `src/index.ts`, único punto que
  escanea `validate-api-stability.ts`. El reporte seguirá diciendo `Deprecated: 0`.
  Opciones: re-exportarlo para que entre en el contrato, eliminarlo (es no-op), o
  aceptar la etiqueta como documentación sin efecto en el validador.
- **T7 (decisión del mantenedor)**. `C-1` quedó parcial: `attrs.ts` permite
  `data:image|audio|video` (SVG solo base64), pero `escapeStyleText` en `src/ssr.ts`
  sigue eliminando `url()` completo, así que una imagen base64 legítima en un estilo
  inline SSR se descarta. Documentado en `SECURITY.md`.
- **T8 (defecto documental en código, no corregido a propósito)**. El comentario de
  cabecera de `src/render/diff-scratch.ts` dice «a module-scoped scratch pool of three
  Maps and two Sets», pero el módulo tiene **5 Maps y 4 Sets** (el párrafo anterior lista
  8 contenedores y luego se contradice). Se deja sin tocar para no invalidar el commit
  certificado `023d5e3`; conviene arreglarlo junto con T5, en un solo commit re-verificado.