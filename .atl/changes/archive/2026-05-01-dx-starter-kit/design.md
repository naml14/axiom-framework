# Design: DX Starter Kit — CLI, Cookbook y HMR

## Technical Approach

Tres entregables independientes: (1) script CLI `create-axiom` que scaffoldea proyecto, (2) `docs/COOKBOOK.md` con recetas, (3) watch mode en `demo/server.ts` con HMR usando `enableHotReloadRecovery()` existente.

## Architecture Decisions

### Decision: CLI como script interno (no paquete npm separado)
- **Choice**: `scripts/create-axiom.ts` ejecutable via `bun run create-axiom`
- **Alternatives considered**: Paquete npm `create-axiom` separado, template repo en GitHub
- **Rationale**: Un solo repo = un solo versionado. Template está en `scripts/templates/`. Si escala, se extrae a paquete separado.

### Decision: HMR via rAF loop + hot reload recovery
- **Choice**: Watch mode detecta cambios con `fs.watch`, re-importa módulo, llama a `app.enableHotReloadRecovery()` y re-renderiza
- **Alternatives considered**: WebSocket, Vite HMR, Bun --watch
- **Rationale**: Reutiliza la API existente de hot reload. No agregar dependencias externas. La limitación (shape changes → full reload) está documentada.

### Decision: Cookbook en un solo archivo vs múltiples
- **Choice**: `docs/COOKBOOK.md` con secciones por receta
- **Alternatives considered**: docs/cookbook/*.md, sitio web documentación
- **Rationale**: Un archivo es más fácil de mantener y buscar. Si escala a 20+ recetas, se divide.

## Data Flow

```
CLI:
  create-axiom my-app
    → mkdir my-app/
    → write my-app/package.json (with axiom dep + scripts)
    → write my-app/tsconfig.json (jsxImportSource config)
    → write my-app/src/app.ts (hello world)
    → write my-app/index.html
    → "bun install" in my-app/
    → "Ready! cd my-app && bun dev"

HMR:
  fs.watch('src/**/*.ts') → debounce 300ms
    → re-import module
    → component._id changed? → enableHotReloadRecovery()
    → scheduleRender() → prepare → reflow → commit
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/create-axiom.ts` | Create | CLI entry point |
| `scripts/templates/` | Create | Project scaffold templates |
| `docs/COOKBOOK.md` | Create | Recipe book (5+ recipes) |
| `demo/server.ts` | Modify | Add --watch flag for HMR |
| `package.json` | Modify | Add create-axiom script entry |
| `.github/CONTRIBUTING.md` | Modify | Reference cookbook |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| CLI | Scaffold genera proyecto válido | Ejecutar CLI → bun test en proyecto generado |
| HMR | Watch mode detecta cambios | Integration test con file write + delay |
| Cookbook | Cada receta tiene código verificable | Smoke test: importar cada receta |

## Migration / Rollout

No migration. Tooling nuevo, cero impacto en runtime.

## Open Questions

- [ ] ¿create-axiom debe publicarse como paquete npm separado o como script interno?