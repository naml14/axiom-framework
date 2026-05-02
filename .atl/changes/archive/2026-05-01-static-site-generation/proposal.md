# Proposal: Static Site Generation (buildStatic API)

## Intent

Axiom necesita exponer una API pública de build estático (`buildStatic()`) que permita a los desarrolladores generar sitios HTML/CSS/JS completos con minificación por defecto. Esto resuelve la Issue #48 y elimina la fricción de tener que configurar manualmente Bun.build() o un bundler externo.

## Scope

### In Scope
- API pública `buildStatic(options)` en `src/index.ts`
- Generación de HTML (vía `renderToString`) + CSS + JS bundle
- Minificación por defecto en todos los artefactos
- Soporte para múltiples rutas/páginas
- Tests de integración (render → file output)
- Demostración en demo/ con build estático

### Out of Scope
- Streaming SSR (cambio separado `streaming-ssr`)
- CSS-in-JS runtime
- Plugins de build personalizados

## Capabilities

### New Capabilities
- `static-build`: API pública para generar sitios estáticos completos desde componentes Axiom

### Modified Capabilities
- None

## Approach

1. Crear `src/build.ts` con `buildStatic()` que recibe: entry component, routes, output dir, options (minify por defecto)
2. Integrar `renderToString()` para generar HTML por ruta
3. Usar `Bun.build()` internamente para bundling JS con `minify: true`
4. Exportar desde `src/index.ts` como `@stable`
5. Tests: verificar output files, contenido HTML, minificación aplicada

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/build.ts` | **Create** | buildStatic() API implementation |
| `src/index.ts` | Modify | Export buildStatic |
| `tests/build.test.ts` | **Create** | Tests for build pipeline |
| `demo/` | Modify | Static build demo page |
| `docs/STATIC-BUILD-MINIFICATION.md` | Archive | Update from proposal to implemented |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bun.build API cambia entre versiones | Medium | Abstraer bundler detrás de interfaz propia |
| Build muy lento para sitios grandes (>100 páginas) | Low | Documentar como limitation, optimizar después |

## Rollback Plan

Revert commits de `src/build.ts` y `src/index.ts`. La feature es puramente aditiva — no toca runtime existente.

## Dependencies

- v1.0.0 release completed (o al menos estabilidad de API asegurada)

## Success Criteria

- [ ] `buildStatic()` produce HTML + JS + (opcional) CSS en directorio de salida
- [ ] Minificación activa por defecto
- [ ] Tests: archivos generados existen, HTML contiene marcado correcto
- [ ] Demo: `bun run build:static` genera sitio funcional