# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- release-please inserts new entries above this line -->

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
