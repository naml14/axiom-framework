# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- release-please inserts new entries above this line -->

## [0.2.4](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.3...axiom-framework-v0.2.4) (2026-04-11)


### Features

* **portal:** add createPortal for rendering outside the component tree ([8ad5896](https://github.com/naml14/axiom-framework/commit/8ad58969bc2053e5604266cf08608841395a67af))
* **portal:** add createPortal for rendering outside the component tree ([ee397b5](https://github.com/naml14/axiom-framework/commit/ee397b5b456a45696a6153e2a0d0de7089f4b514))


### Bug Fixes

* **portal:** address PR review findings — cleanup safety, layout, and diff routing ([9d25415](https://github.com/naml14/axiom-framework/commit/9d25415cd5318d846679d5eccd44b5a07b8df2f6))

## [0.2.3](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.2...axiom-framework-v0.2.3) (2026-04-05)


### Features

* **context,forms:** add reactive context and forms modules for v0.3.0 ([a8b9060](https://github.com/naml14/axiom-framework/commit/a8b9060a2fb2c74a79827cfa3aa3b661fc3ff70d))
* **context,forms:** add reactive context and forms modules for v0.3.0 ([d619b1f](https://github.com/naml14/axiom-framework/commit/d619b1fe60237ebde747dc90bdf75408decae0e4)), closes [#4](https://github.com/naml14/axiom-framework/issues/4)


### Bug Fixes

* **forms,context:** address PR review findings from Sourcery AI and Gemini ([e89413e](https://github.com/naml14/axiom-framework/commit/e89413e6522d01ed435e9ef28946575e6ab9398b))
* **tests:** use GlobalWindow and mount select to body to fix happy-dom select tests ([599782d](https://github.com/naml14/axiom-framework/commit/599782d37d2fb3abd7f759aeeef7310198e8c06a))

## [0.2.2](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.1...axiom-framework-v0.2.2) (2026-04-04)


### Features

* add declarative events and native flexWrap support ([d0de77a](https://github.com/naml14/axiom-framework/commit/d0de77a9158db9a6515e059f943bc96b5db97b75))


### Bug Fixes

* **ci:** configure npm auth via registry-url and opt into Node.js 24 for release-please ([304e027](https://github.com/naml14/axiom-framework/commit/304e027c09b694b145ceb27bfac518ff04313d20))
* **ci:** use registries input instead of deprecated registry-url in setup-bun ([717b6ca](https://github.com/naml14/axiom-framework/commit/717b6ca139cd443ccf74fea6831a1c08b9c25adc))

## [0.2.1](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.0...axiom-framework-v0.2.1) (2026-04-04)


### Features

* add masonry layout demo application with reactive container resizing ([6ffe596](https://github.com/naml14/axiom-framework/commit/6ffe596aaf19ad9e1cc0a333b8b7f194cff2ce87))
* implement core layout engine with flexbox support and reflow logic ([6da6aa3](https://github.com/naml14/axiom-framework/commit/6da6aa3ec1ef2ace38c12378250bf854c47e487c))
* implement demo application with masonry layout and performance metrics tracking ([7b4270e](https://github.com/naml14/axiom-framework/commit/7b4270e91d989c465760389c83a7577c5eec2b96))
* prepare v0.2.0 for public release ([30ed247](https://github.com/naml14/axiom-framework/commit/30ed24725f16d0efaa13106c7b3df14b6e582d01))
* refactor app structure by modularizing components, controls, and layout logic ([cc6bdfc](https://github.com/naml14/axiom-framework/commit/cc6bdfc9c89d06b3c6afe4e9c058fce6f65b2426))
* **tests:** add comprehensive test suite for components, diffing, reflow, signals, and scheduler ([e52a564](https://github.com/naml14/axiom-framework/commit/e52a564149d30bb1d925f3f5281fc3c8a52cfd36))
* update version to 0.1.0 in package.json ([76c4bf1](https://github.com/naml14/axiom-framework/commit/76c4bf108f17bc2e68d83cab1cb1d2f6f73fb44b))


### Bug Fixes

* resolve typecheck errors in CI — re-export DOMOperation and narrow ComponentNode union ([4ea6dc6](https://github.com/naml14/axiom-framework/commit/4ea6dc63e4a1410b43f2c1064d97451f99d221d7))
* resolve TypeScript compilation errors ([6bbfca3](https://github.com/naml14/axiom-framework/commit/6bbfca3aea9e882919f5fe22e77f574429b944e9))

## [0.1.1] - 2026-03-15

### Added in 0.1.1

- Masonry demo with tag cloud, hero card, and multi-column layout
- Demo controls: container width slider, item count slider
- Live metrics panel (prepare/reflow/commit timings)

## [0.1.0] - 2026-03-01

### Added in 0.1.0

- **Phase 1 — Signals**: `signal()`, `computed()`, `effect()` with dependency tracking, circular detection, cleanup functions
- **Phase 2 — Reflow Engine**: `prepare()`, `reflow()` with flex layout (row/column, gap, justify, align, padding) and fast path for simple block layouts
- **Phase 3 — Commit Engine**: `commitFull()`, `applyOps()`, `fullDiff()`, `fastDiff()` with key-based reconciliation
- **Phase 4 — App**: `createApp()`, `mount()`, `unmount()`, `getMetrics()`
- **Scheduler**: rAF batching with generation invalidation, injectable for testing
- **Brand types**: Opaque `PreparedComponent` handle — consumers cannot accidentally access internal structure
- **Float32Array** layout buffers — zero unnecessary allocations in the hot path
- **146 unit + integration tests**
