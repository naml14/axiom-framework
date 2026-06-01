# Apply Progress: SSR Stylesheet Origin Policy

**Status**: ✅ Complete — all tasks implemented, verified, and committed.

**Mode**: Standard (not Strict TDD — tasks.md uses TDD-ordered phases but openspec/config.yaml does not enforce strict_tdd)

## Tasks Completed

- [x] 1.1 Spec alignment: blocked scenarios updated to assert `<link>` absence (omission contract)
- [x] 2.1 Tests for `sanitizeUrlValue` added to `tests/edge-cases.test.ts`
- [x] 2.2 `sanitizeUrlValue` extracted in `src/core/attrs.ts`; `sanitizeAttrValue` refactored to use it
- [x] 3.1 SSR stylesheet tests added to `tests/ssr.test.ts` (10 new test cases)
- [x] 3.2 `renderHead` in `src/ssr.ts` updated: sanitize before `escapeHtml`, omit blocked hrefs
- [x] 4.1 `SECURITY.md` External Stylesheet SSRF section updated with scheme-floor description and CSP `style-src` guidance
- [x] 4.2 Verification: `bun test` → 676 pass, 2 skip, 0 fail; `bunx tsc --noEmit` → clean

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/core/attrs.ts` | Modified | Added `sanitizeUrlValue()`; refactored `sanitizeAttrValue()` to delegate to it |
| `src/ssr.ts` | Modified | Import `sanitizeUrlValue`; stylesheet loop now omits blocked hrefs |
| `tests/edge-cases.test.ts` | Modified | Added `sanitizeUrlValue` test suite (10 tests) |
| `tests/ssr.test.ts` | Modified | Added `SSR: stylesheet origin policy` describe block (10 tests) |
| `SECURITY.md` | Modified | Updated External Stylesheet SSRF section |
| `openspec/changes/ssr-stylesheet-origin-policy/specs/ssr-security/spec.md` | Modified | Updated 4 blocked-scheme scenarios + mixed scenario to reflect omission contract |
| `openspec/changes/ssr-stylesheet-origin-policy/tasks.md` | Modified | All tasks marked `[x]` |

## Commits

| Hash | Subject |
|------|---------|
| `5a1f18d` | refactor(attrs): extract sanitizeUrlValue helper and refactor sanitizeAttrValue |
| `fefd850` | fix(ssr): omit stylesheet link tags with dangerous schemes or protocol-relative hrefs |
| `cc8dc3f` | docs(security): document scheme-floor protection and add CSP style-src guidance |

## Deviations from Design

None — implementation matches design.md exactly. The data flow, sentinel value (`'#blocked'`), loop shape, and file change list all match.

## Verification Results

```
bun test: 676 pass, 2 skip, 0 fail (678 total across 34 files)
bunx tsc --noEmit: no output (clean)
```
