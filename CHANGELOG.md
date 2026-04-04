# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-03

### Added
- **Publishing infrastructure**: TypeScript installed as devDependency, `tsc` build pipeline, `.d.ts` + source maps emitted to `dist/`
- **Package exports**: Proper `exports` field with types and ESM entry point
- **`sideEffects: false`** for tree-shaking support in bundlers
- **CI/CD**: GitHub Actions workflow — typecheck + tests + build on every push and PR
- **README.md**: Full documentation with philosophy, quick start, API reference, architecture diagram, and performance invariants
- **LICENSE**: MIT
- **CHANGELOG.md**: This file
- **Edge case tests**: Empty tree, single text node, deeply nested tree, fragment at root
- **Benchmark**: Basic prepare/reflow/commit timing with a 1000-node tree
- **JSDoc**: Documented DOM read in `getConstraints()` (acceptable for initial constraints, not hot path)
- `declarationMap` and `sourceMap` added to tsconfig for better debugging experience in consuming projects
- Package renamed from `axiom` to `axiom-framework` to avoid npm conflict

### Fixed
- `unmount()` now clears `domState.domNodes` array reference properly to avoid memory leaks

## [0.1.1] - 2026-03-15

### Added
- Masonry demo with tag cloud, hero card, and multi-column layout
- Demo controls: container width slider, item count slider
- Live metrics panel (prepare/reflow/commit timings)

## [0.1.0] - 2026-03-01

### Added
- **Phase 1 — Signals**: `signal()`, `computed()`, `effect()` with dependency tracking, circular detection, cleanup functions
- **Phase 2 — Reflow Engine**: `prepare()`, `reflow()` with flex layout (row/column, gap, justify, align, padding) and fast path for simple block layouts
- **Phase 3 — Commit Engine**: `commitFull()`, `applyOps()`, `fullDiff()`, `fastDiff()` with key-based reconciliation
- **Phase 4 — App**: `createApp()`, `mount()`, `unmount()`, `getMetrics()`
- **Scheduler**: rAF batching with generation invalidation, injectable for testing
- **Brand types**: Opaque `PreparedComponent` handle — consumers cannot accidentally access internal structure
- **Float32Array** layout buffers — zero unnecessary allocations in the hot path
- **146 unit + integration tests**

[0.2.0]: https://github.com/naml14/axiom-framework/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/naml14/axiom-framework/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/naml14/axiom-framework/releases/tag/v0.1.0
