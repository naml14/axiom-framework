# Tasks: v1.0.0 Release — Stability & Go/No-Go

## Phase 1: M3 Validation (COMPLETED 2026-05-01)

- [x] 1.1 Run `bun run validate:api` — 121 stable, 0 errors
- [x] 1.2 Run `bun run test:coverage` — 96.54% >= 85% gate
- [x] 1.3 Run regression SSR/hydration — 20/20 pass, 0 fail
- [x] 1.4 Run full suite — 555 pass, 2 skip, 0 fail
- [x] 1.5 Run `bun run typecheck` — 0 errors
- [ ] 1.6 Verify multi-app isolation with concurrent createApp instances
- [x] 1.7 Document snapshot en `docs/V1-0-0-EVIDENCE-LOG.md`

## Phase 2: M4 Release

- [ ] 2.1 Crear release PR con `release-as: 1.0.0` usando release-please
- [ ] 2.2 Verificar CHANGELOG.md alineado con cambios reales desde v0.9.3
- [ ] 2.3 Merge release PR a main
- [ ] 2.4 Verificar artefacto npm publicado (v1.0.0 en npm registry)
- [ ] 2.5 Cerrar épica #30 con enlace a release tag

## Phase 3: Documentation

- [ ] 3.1 Actualizar `docs/V1-0-0-EVIDENCE-LOG.md` con snapshot de validación M3+M4
- [ ] 3.2 Actualizar `docs/V1-0-0-PLAN-TRAZABILIDAD.md` marcando M3 y M4 completados
- [ ] 3.3 Verificar README.md badges y versión apuntan a v1.0.0