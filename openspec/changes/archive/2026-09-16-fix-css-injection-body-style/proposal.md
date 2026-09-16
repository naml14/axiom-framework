# Proposal: Fix CSS Injection via bodyStyle Metadata

## Intent

The `bodyStyle` SSR metadata field passes user-provided CSS through `escapeHtml()` into a `<body style="...">` attribute, which only escapes HTML entities but does not block CSS-specific injection vectors like `url()` (data exfiltration), `@import` (external stylesheet loading), or `expression()` (legacy CSS execution). Replace with `escapeStyleText()` — the same sanitization already used for `inlineStyles`.

## Scope

### In Scope
- Replace `escapeHtml()` with `escapeStyleText()` for `bodyStyle` in `src/ssr.ts`
- Add test case verifying CSS injection is sanitized in `tests/ssr.test.ts`
- Document `bodyStyle` sanitization in `SECURITY.md`
- Document sanitization note in `docs/SSR-HYDRATION-CONTRACT.md`

### Out of Scope
- Removing the `bodyStyle` field entirely (breaking change, deferred)
- Adding a CSS property whitelist (overly restrictive for body-level styles)
- Dual escaping (redundant with `escapeStyleText`)
- Changes to `inlineStyles` handling (already secure)

## Capabilities

### New Capabilities
None — this is a security fix, not a new capability.

### Modified Capabilities
None — no spec-level requirement changes. Existing `SSRMetadata` type and behavior contract remain the same; only the sanitization implementation changes.

## Approach

1. **Code fix**: Replace `escapeHtml(options.metadata.bodyStyle)` with `escapeStyleText(options.metadata.bodyStyle)` on line 95 of `src/ssr.ts`. This reuses the existing, tested `escapeStyleText()` function that already blocks `url(`, `@import`, `expression(`, `behavior:`, and `javascript:`.

2. **Test**: Add a test case in `tests/ssr.test.ts` that renders `bodyStyle` with injection payloads (`url(data:...)`, `@import`, `expression()`) and verifies they are sanitized in the output.

3. **Documentation**: Add `bodyStyle` to the SSR threats section in `SECURITY.md` alongside the existing `inlineStyles` entry. Add a note in `SSR-HYDRATION-CONTRACT.md` that `bodyStyle` content is CSS-sanitized.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/ssr.ts:94-95` | Modified | Replace `escapeHtml()` with `escapeStyleText()` |
| `tests/ssr.test.ts` | Modified | Add bodyStyle sanitization test |
| `docs/SSR-HYDRATION-CONTRACT.md:118` | Modified | Add sanitization note |
| `SECURITY.md` | Modified | Add bodyStyle threat entry |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legitimate `url()` in bodyStyle is stripped | Low | Rare use case; users can use `inlineStyles` for complex CSS |
| Breaking semantic contract for existing users | Low | Security fix; document in changelog and release notes |
| No regression baseline (no existing bodyStyle tests) | Medium | Add tests before applying; verify existing SSR tests still pass |

## Rollback Plan

1. Revert the single-line change in `src/ssr.ts` — `escapeHtml()` is the original behavior.
2. Revert test changes in `tests/ssr.test.ts`.
3. Revert documentation changes in `SECURITY.md` and `SSR-HYDRATION-CONTRACT.md`.
4. No migration needed — the change is purely internal to the sanitizer.

## Dependencies

- `escapeStyleText()` function in `src/ssr.ts` (already exists, line 219)
- Existing SSR test suite (`bun test`)

## Success Criteria

- [ ] `bodyStyle` with CSS injection payloads (`url(data:...)`, `@import`, `expression()`) is sanitized in the rendered `<body>` tag
- [ ] All existing SSR tests pass (`bun test`)
- [ ] `SECURITY.md` documents bodyStyle as a sanitization target
- [ ] `SSR-HYDRATION-CONTRACT.md` notes bodyStyle sanitization
