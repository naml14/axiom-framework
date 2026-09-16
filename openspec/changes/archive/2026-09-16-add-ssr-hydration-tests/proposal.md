# Proposal: add-ssr-hydration-tests

## Intent

Add real SSR-to-hydration test coverage to address the verification warning in `fix-css-transform-animations`. This will prove the transform composition contract (`translate(Xpx,Ypx) var(--animation-transform)`) and `onTransformConflict` detection inside a true SSR→hydrate→interact cycle, ensuring behavior consistency between server and client without using a real browser.

## Scope

### In Scope
- Create `tests/ssr-hydration.test.ts` as a standalone harness for SSR and hydration.
- Test `renderToString` and `commitHydrate` interaction, validating the inline style string contract.
- Test `onTransformConflict` in a hydration update cycle.
- Update `docs/TESTING-GUIDE.md` to document the SSR/Hydration Testing pattern.

### Out of Scope
- Modifying runtime behavior in `src/`.
- Resolving `var()` custom properties or executing keyframes in tests (happy-dom limitation).
- Refactoring existing tests (`tests/hydration.test.ts`, `tests/commit.test.ts`) to use a shared harness.

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Approach

Create a new standalone test file `tests/ssr-hydration.test.ts` that incorporates the `fakeTextEngine` and `installWindow` patterns from `tests/hydration.test.ts`. This file will focus on testing the transform parity across SSR and hydration, `--animation-transform` variable composition post-render, and `onTransformConflict` hook firing. The `docs/TESTING-GUIDE.md` will be appended with documentation for this testing pattern.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `tests/ssr-hydration.test.ts` | New | New test file verifying SSR to hydration flow and transforms. |
| `docs/TESTING-GUIDE.md` | Modified | Add "SSR/Hydration Testing" documentation. |
| `src/ssr.ts` | Read-only | Reference for transform string output. |
| `src/render/commit.ts` | Read-only | Reference for `commitHydrate` and `onTransformConflict`. |
| `src/app.ts` | Read-only | Reference for `createApp({ hydrate: true })`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| happy-dom cannot resolve CSS `var()` | High | Tests assert the literal string structure rather than computed values. |
| `docs/TESTING.md` path confusion | Low | Scope meant `docs/TESTING-GUIDE.md`, which is explicitly targeted in tasks. |

## Rollback Plan

Delete the `tests/ssr-hydration.test.ts` file and revert changes to `docs/TESTING-GUIDE.md`. No runtime source files are modified, making rollback completely safe.

## Dependencies

- None

## Success Criteria

- [ ] `tests/ssr-hydration.test.ts` executes successfully using `bun test`.
- [ ] Tests verify that the string `translate(Xpx,Ypx) var(--animation-transform)` remains intact across SSR, hydration, and re-renders.
- [ ] Tests verify `onTransformConflict` fires correctly during a hydration update cycle.
- [ ] `docs/TESTING-GUIDE.md` contains the new "SSR/Hydration Testing" section.