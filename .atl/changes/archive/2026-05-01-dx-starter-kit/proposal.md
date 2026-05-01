# Proposal: DX Starter Kit — CLI, Cookbook y HMR

## Intent

Axiom tiene cero tooling de onboarding. Un desarrollador nuevo debe configurar tsconfig.json, jsxImportSource, el servidor de desarrollo, etc. manualmente. Para adopción masiva necesitamos: un CLI tipo `create-axiom`, documentación basada en recetas (cookbook), y soporte de HMR en desarrollo.

## Scope

### In Scope
- `npx create-axiom` CLI que genera proyecto completo con Bun + TSX + Axiom
- Cookbook: 5+ recetas prácticas (dashboard, editor, formularios, SSR básico, animaciones)
- Servidor de desarrollo con watch mode + HMR para la capa de sintaxis
- Documentación de onboarding estructurada en `docs/COOKBOOK.md`

### Out of Scope
- Plugin Vite/Rollup/Webpack (el ecosistema Bun es suficiente para v1)
- Componentes UI pre-built (eso es un ecosistema aparte)
- IDE extensions

## Capabilities

### New Capabilities
- `create-axiom-cli`: Scaffolding interactivo de proyectos Axiom
- `cookbook`: Guías prácticas de uso del framework

### Modified Capabilities
- None

## Approach

1. **CLI**: Paquete npm separado `create-axiom` (o script en `scripts/create-axiom.ts`) que usa `Bun.write()` para scaffolds
2. **Cookbook**: Archivo `docs/COOKBOOK.md` con recetas incrementales. Cada receta: problema → solución → código → explicación
3. **HMR**: Extender `demo/server.ts` con watch mode que recarga la app sin perder estado (usando `enableHotReloadRecovery()` ya existente)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/create-axiom.ts` | **Create** | CLI scaffolding tool |
| `docs/COOKBOOK.md` | **Create** | Recipe-based documentation |
| `demo/server.ts` | Modify | Add HMR/watch support |
| `package.json` | Modify | Add `create-axiom` script |
| `.github/CONTRIBUTING.md` | Modify | Link to cookbook |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CLI genera proyecto que falla por versiones未来 | Low | Template usa rangos de version, no fijas |
| HMR no funciona con cambios de estructura (shape changes) | Medium | Documentar limitación: HMR parcial para value-only |

## Rollback Plan

CLI es script independiente. HMR se revierte revirtiendo cambios a `demo/server.ts`.

## Dependencies

- v1.0.0 (para que el starter use la API estable)

## Success Criteria

- [ ] `bun run create-axiom my-app` genera proyecto funcional (`bun dev` abre en browser)
- [ ] Cookbook con 5+ recetas verificadas
- [ ] `demo:watch` recarga cambios de sintaxis en <500ms
- [ ] Proyecto generado pasa `bun test && bun run typecheck`