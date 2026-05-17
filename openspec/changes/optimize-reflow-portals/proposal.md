# Proposal: optimize-reflow-portals

## Intent
Remove dead portal-handling code in `layoutNode` (lines 98–108 in `reflow.ts`). This block is skipped by all layout engines (`measureSimple`, `measureFlex`, `measureGrid`) so it never executes. Keeping it violates principles of clarity and code hygiene.

## Scope

### In Scope
- Remove the portal check block inside `reflow.ts:layoutNode`.
- Ensure no regressions in portal behavior via existing tests.
- Update `openspec/specs/render-pipeline.md` to remove references to the removed block.

### Out of Scope
- Modifying `reflowPortalChildren()`.
- Changing the behavior of `measureSimple`, `measureFlex`, or `measureGrid`.
- Any changes to actual portal rendering engines or behavior.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `render-pipeline`: Update the specification to reflect the removal of the dead code from `layoutNode`.

## Approach
Delete lines 98-108 in `src/render/reflow.ts` where `nodeType === 'portal'` is checked. Since portal children lay out differently (via `reflowPortalChildren()`) and are skipped by layout engines during their own passes, this code inside `layoutNode` is unreachable or a no-op.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/render/reflow.ts` | Modified | Lines 98-108 removed in `layoutNode`. |
| `openspec/specs/render-pipeline.md` | Modified | Updated to reflect the removal of the dead code. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unintended portal layout regressions | Low | Rely on existing portal tests and verify visual output. The code is demonstrably unreachable during normal engine layout passes. |

## Rollback Plan
Revert the commit modifying `src/render/reflow.ts` and `openspec/specs/render-pipeline.md`.

## Dependencies
- None

## Success Criteria
- [ ] `reflow.ts` no longer contains the portal condition inside `layoutNode`.
- [ ] Existing portal tests pass without modification.
- [ ] Render pipeline spec no longer references the dead block.