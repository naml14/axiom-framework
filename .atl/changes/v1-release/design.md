# Design: v1.0.0 Release — Stability & Go/No-Go

## Technical Approach

Release basado en el estado actual de `main` (v0.9.3). No se requiere merge de `feat/v1-0-0-kickoff`. El release se ejecuta via release-please con `release-as: 1.0.0`.

## Architecture Decisions

### Decision: No mergear feat/v1-0-0-kickoff
- **Choice**: Releasear desde `main` directamente
- **Alternatives considered**: Mergear kickoff, cherry-pick commits, rebase
- **Rationale**: `main` ya superó a kickoff en strict-types-sprint y syntax-layer-v2. Kickoff revertiría tipos estrictos y DOMOperation discriminated unions.

### Decision: M3 como gating PR antes del release
- **Choice**: PR separado de validación M3 que debe pasar antes del release PR
- **Alternatives considered**: Validar directo en release PR
- **Rationale**: Separar responsabilidades — validación y release son fases distintas con criterios Go/No-Go diferentes

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `CHANGELOG.md` | Modify | Alinear con v1.0.0 real |
| `docs/V1-0-0-EVIDENCE-LOG.md` | Modify | Snapshot final M3+M4 |
| `docs/V1-0-0-PLAN-TRAZABILIDAD.md` | Modify | Marcar M3/M4 completados |
| `package.json` | Modify | Version bump via release-please |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Regression | Suite completa SSR/hydration | `bun test tests/ssr.test.ts tests/hydration.test.ts` |
| Multi-app | Aislamiento entre instancias | Tests existentes en app.test.ts |
| Performance | Benchmarks no regresivos | `bun test tests/benchmark.test.ts` |
| API Stability | Validación de exports | `bun run validate:api` |

## Migration / Rollout

No migration required. v1.0.0 es el mismo código que v0.9.3 más validación. Release es un cambio de semver.

## Open Questions

- [ ] Release-please está configurado para release-as manual o automático?