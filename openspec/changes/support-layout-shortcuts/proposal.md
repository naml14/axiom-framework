# Proposal: support-layout-shortcuts

## Intent

Close the `space-around`/`baseline` gap in the layout shortcuts pipeline. These values are syntactically accepted but silently ignored because they're missing from core types and unhandled in the flex engine.

## Scope

### In Scope
- Add `space-around` to `JustifyContent` (core types).
- Add `baseline` to `AlignItems` (core types).
- Implement `space-around` branch in flex.ts justify logic.
- Implement `baseline` branch in flex.ts align logic (approximated as `center`).
- Update `LayoutShortcuts` in syntax layer to reflect supported values.
- Add validation to prevent invalid values at the syntax layer.

### Out of Scope
- Breaking changes to existing behaviors (`start`/`center`/`end`/`stretch`).
- Perfect `baseline` calculation (we are explicitly documenting it as approximated to `center`).

## Capabilities

### New Capabilities
- `layout-shortcuts`: Support for the missing layout shortcuts (space-around, baseline) and strict validation.

### Modified Capabilities
None

## Approach

1. Update `src/core` to include `space-around` and `baseline` in flex types.
2. Update `src/render/flex.ts` to implement CSS-like semantics for `space-around` and map `baseline` to `center`.
3. Update syntax layer (`src/syntax`) to add runtime validation that rejects unsupported values instead of silently dropping them.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/types` | Modified | Add `space-around` and `baseline` to core types |
| `src/render/flex.ts` | Modified | Implement new values in rendering logic |
| `src/syntax/LayoutShortcuts.ts` | Modified | Support new values and add strict validation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing behaviors | Low | High test coverage for `start`/`center`/`end`/`stretch` |
| Misunderstanding of `baseline` | Low | Clearly document that `baseline` is approximated as `center` |

## Rollback Plan

Revert the specific commits that introduce these properties into `src/core`, `src/render`, and `src/syntax`. Re-enable silent failure if validation breaks existing code.

## Dependencies

- None

## Success Criteria

- [ ] `space-around` correctly distributes items following CSS flexbox semantics.
- [ ] `baseline` successfully centers items along the cross axis.
- [ ] Invalid layout shortcuts throw explicit validation errors at syntax layer.
- [ ] Existing `start`/`center`/`end`/`stretch` behaviors remain functionally identical.
