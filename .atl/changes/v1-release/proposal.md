# Proposal: v1.0.0 Release — Stability & Go/No-Go

## Intent

Axiom está en v0.9.3 con todo el trabajo P0/P1 del "Readiness Program" (#30) ya implementado en `main`. Falta ejecutar la validación integral (Fase M3) y el release formal (Fase M4) para publicar v1.0.0. Sin este paso, ningún desarrollador adoptará el framework en producción por falta de un contrato de estabilidad.

## Scope

### In Scope
- Ejecutar M3: regresión SSR/hydration, aislamiento multi-app/multi-context, release dry-run
- Ejecutar M4: release PR con `release-as: 1.0.0`, verificación de artefacto publicado
- Actualizar CHANGELOG.md y evidence log alineados con cambios reales
- CI verde + coverage gate activo y verificado en PR
- Cierre de la épica #30 con snapshot final de evidencia

### Out of Scope
- Nuevas features (SSG, streaming SSR, CLI — tienen sus propios cambios SDD)
- Refactors arquitectónicos no críticos

## Capabilities

### New Capabilities
- `v1-release`: Proceso de release formal con validación y trazabilidad completa

### Modified Capabilities
- None

## Approach

1. **M3 — Validación integral**: Ejecutar suite completa de regresión en SSR/hydration, pruebas de aislamiento multi-app, verificación de release dry-run con `bun run validate:api && bun run test:coverage && bun run typecheck`
2. **M4 — Release**: Crear PR con `release-as: 1.0.0` usando release-please, verificar artefacto npm publicado, cerrar épica #30
3. **Docs**: Actualizar CHANGELOG.md, EVIDENCE-LOG.md, y snapshot final

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `CHANGELOG.md` | Modified | Alinear con release v1.0.0 |
| `docs/V1-0-0-EVIDENCE-LOG.md` | Modified | Snapshot final de validación |
| `.github/workflows/ci.yml` | Verify | Confirmar gate activo |
| `package.json` | Modified | version bump via release-please |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Release-please no detecta cambios semver correctamente | Low | Validación manual del changelog antes de publicar |
| Falla CI en PR por timeout de benchmarks | Low | Ajustar thresholds si es necesario |

## Rollback Plan

Si v1.0.0 tiene issues críticos post-release: publicar v1.0.1 con fix, NO des-publicar. El contrato de estabilidad permite patches.

## Dependencies

- CI verde en el PR de release
- `release-please` configurado correctamente

## Success Criteria

- [ ] CI verde con coverage gate (>= 85%)
- [ ] `bun run validate:api` — 0 errors
- [ ] Release PR creado y mergeado
- [ ] Artefacto v1.0.0 publicado en npm
- [ ] Épica #30 cerrada con evidencia documentada