# Tasks: Static Site Generation (buildStatic API)

## Phase 1: Core API

- [x] 1.1 Create `src/build.ts` with `buildStatic()` function — routes, outDir, minify (default true)
- [x] 1.2 Implement HTML generation per route via `renderToString()` + metadata injection
- [x] 1.3 Implement JS bundling via `Bun.build()` with target browser + minify
- [x] 1.4 Implement asset manifest output (JSON list of generated files)
- [x] 1.5 Export `buildStatic` and `BuildStaticOptions` from `src/index.ts` as `@stable`

## Phase 2: Tests

- [x] 2.1 Create `tests/build.test.ts` — test filesystem output exists
- [x] 2.2 Test HTML correctness: doctype, data-axiom-id, metadata injection
- [ ] 2.3 Test minification is applied (JS bundle size < unminified equivalent)
- [x] 2.4 Test multiple routes produce separate HTML files
- [x] 2.5 Test edge cases: empty routes, special characters in paths

## Phase 3: Demo & Docs

- [x] 3.1 Refactor `demo/build.ts` to use `buildStatic()` internally
- [x] 3.2 Add `build:static` script to `package.json` — points to `scripts/build-static.ts`
- [x] 3.3 Update `docs/STATIC-BUILD-MINIFICATION.md` from "proposed" to "implemented"
- [ ] 3.4 Add SSG example to cookbook (once dx-starter-kit is live)