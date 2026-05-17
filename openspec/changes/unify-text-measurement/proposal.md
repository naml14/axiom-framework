# Proposal: Unify Text Measurement

## Intent
Unify text measurement across all layout engines. The current discrepancy (`reflow.ts:layoutText` using `charWidth=6` without word-wrap factor vs. others using `charWidth=8` + `1.4×` factor) causes root-level text nodes to render with the wrong height.

## Scope

### In Scope
- Unify `charWidth=8` and `wordWrapFactor=1.4` across all engines.
- Extract `measureTextChild` from `flex.ts` and `grid.ts` into a shared helper function.
- Update `reflow.ts:layoutText` to use the new shared helper.
- Update or add tests verifying the height of root-level text nodes.

### Out of Scope
- Modifying non-text layout logic.
- Changing measurement variables other than `charWidth` and `wordWrapFactor` for this fix.

## Capabilities

### New Capabilities
- `text-measurement`: Standardized cross-engine text measurement and bounding box calculation.

### Modified Capabilities
None

## Approach
Extract the duplicate `measureTextChild` logic currently in `flex.ts` and `grid.ts` into a new shared utility. Replace the legacy measurement logic in `reflow.ts:layoutText` with a call to this shared helper. Ensure that all engines apply `charWidth=8` and `wordWrapFactor=1.4` consistently. Finally, adjust unit tests to assert the correct dimensions for root-level text nodes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/flex.ts` | Modified | Extract `measureTextChild` |
| `src/grid.ts` | Modified | Extract `measureTextChild` |
| `src/reflow.ts` | Modified | Replace legacy text measurement with shared helper |
| Shared util | New | Implement shared `measureTextChild` helper |
| Tests | Modified/New | Add/update root-level text node dimension tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regressions in existing reflow tests | Medium | Run full test suite; explicitly test boundary cases for text wrapping |
| Breaking downstream consumers of text metrics | Low | Coordinate changes with comprehensive test updates; the new layout matches existing fast-path behavior |

## Rollback Plan
Revert the commit introducing the shared `measureTextChild` helper and restore `reflow.ts`, `flex.ts`, and `grid.ts` to their previous measurement implementations. Revert accompanying test updates.

## Dependencies
- None

## Success Criteria
- [ ] `reflow.ts:layoutText` correctly applies `charWidth=8` and `wordWrapFactor=1.4`.
- [ ] `measureTextChild` logic is de-duplicated and imported from a shared location in `flex.ts`, `grid.ts`, and `reflow.ts`.
- [ ] Tests for root-level text nodes pass and assert the newly unified height metrics.
