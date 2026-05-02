# Proposal: Memory Pooling for Layout Engines

## Intent

Axiom's hot path (`reflow -> commit`) aims to be allocation-free to ensure 60fps rendering without GC pauses. Currently, `reflow` allocates four new `Float32Array` instances per layout pass (for `x, y, width, height`). This creates significant Garbage Collector pressure on large component trees during frequent updates (e.g., animations or rapid resize events). We need to pool and recycle these buffers.

## Scope

### In Scope
- Create a memory pool for `Float32Array` buffers.
- Integrate the pool into `src/render/reflow.ts` so it reuses buffers instead of instantiating new ones.
- Integrate buffer release logic into the end of the `commit` phase or `app.ts` tick.
- Tests to ensure buffers are safely recycled and cleared without layout artifacts.

### Out of Scope
- Prepare-phase component structural caching (pooling `PreparedComponent` objects). This is deferred to a separate caching optimization initiative.
- WebAssembly (Wasm) or SharedArrayBuffer based rendering engines.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. This is purely an internal performance and memory optimization.

## Approach

1. Create `src/render/pool.ts` containing a buffer manager.
2. `acquireLayoutResult(nodeCount)` will return a `LayoutResult` backed by recycled `Float32Array` buffers (growing them if `nodeCount` exceeds current capacity).
3. Update `src/render/reflow.ts` to call `acquireLayoutResult(count)` instead of `new Float32Array(count)`.
4. Update `src/app.ts` (scheduler tick) to call `releaseLayoutResult(result)` once the `commit` phase has fully processed the layout.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/render/pool.ts` | New | Float32Array pooling logic |
| `src/render/reflow.ts` | Modified | Acquire buffers from the pool |
| `src/app.ts` | Modified | Release buffers after commit |
| `tests/reflow.test.ts` | Modified | Add pooling regression tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale data in recycled buffers causes layout artifacts | Low | Overwrite all used indices during `reflow`, or explicitly zero out arrays in `release`. |
| Memory leaks if buffers are never released | Medium | Tie the release explicitly to the synchronous `commit` lifecycle in `app.ts`. |

## Rollback Plan

Revert the changes to `src/render/reflow.ts` to resume instantiating `new Float32Array(count)` natively.

## Dependencies

- None.

## Success Criteria

- [ ] Benchmark tests show `0` allocations for `Float32Array` during a continuous `reflow -> commit` loop.
- [ ] No regression in layout correctness (all 562 tests pass).
- [ ] Memory footprint remains stable during continuous state updates.
