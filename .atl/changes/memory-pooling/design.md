# Design: Memory Pooling for Layout Engines

## Technical Approach

Introduce a `Float32Array` buffer pool to eliminate memory allocations in the `reflow` phase hot path. `reflow` currently creates new arrays for `x, y, width, height` on every cycle. By requesting buffers from `src/render/pool.ts` and releasing them in the scheduler (`src/app.ts`) after `commit()`, we recycle memory and reduce Garbage Collector pressure.

## Architecture Decisions

### Decision: Pool Implementation Strategy

**Choice**: A central LIFO stack (array) of `LayoutResult` objects in `src/render/pool.ts`.
**Alternatives considered**: Pre-allocating one massive global array and returning sliced views.
**Rationale**: Managing slices and defragmentation is complex and error-prone. A simple stack of pre-allocated `Float32Array` sets that grow to meet maximum capacity needs is simpler and just as effective for avoiding per-frame allocations.

### Decision: When to release buffers

**Choice**: Release at the end of the scheduler tick in `src/app.ts`, immediately after `commit()`.
**Alternatives considered**: Releasing at the start of the next `reflow`.
**Rationale**: Releasing after `commit()` explicitly signals that the DOM has been updated and the layout arithmetic is no longer needed. This ensures buffers are immediately available for any subsequent synchronous updates or animations, maintaining a tight lifecycle.

### Decision: Buffer Sizing

**Choice**: Buffers only grow, they never shrink. If a request exceeds current buffer capacity, a new larger buffer is allocated and replaces the old one.
**Alternatives considered**: Exact-size matching or shrinking buffers on small renders.
**Rationale**: UI node counts tend to stabilize. Growing to the high-water mark guarantees that eventually, zero allocations occur. The memory overhead of keeping a slightly larger buffer than necessary is negligible compared to the CPU cost of GC pauses.

## Data Flow

    [Signal Update] ──→ Scheduler Tick
                             │
                             ▼
    [prepare] ──→ [reflow] ──→ acquireLayoutResult(size) ──→ Pool (pop or allocate)
                     │
                     ▼
    [commit] ──→ Updates DOM using LayoutResult
                     │
                     ▼
    [End of Tick] ──→ releaseLayoutResult(result) ──→ Pool (push)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/render/pool.ts` | Create | Implements `acquireLayoutResult` and `releaseLayoutResult`. Maintains a stack of idle `LayoutResult` buffers. |
| `src/render/reflow.ts` | Modify | Import and use `acquireLayoutResult` instead of `new Float32Array()`. |
| `src/app.ts` | Modify | Update `flushScheduler()` to capture the `LayoutResult` returned by `reflow` (if any) and call `releaseLayoutResult` after `commit`. |
| `src/core/types.ts` | Modify | Update `LayoutResult` type if necessary (e.g. adding a `capacity` property) |
| `tests/reflow.test.ts` | Modify | Add tests to ensure pooling returns correct instances and grows capacity properly. |

## Interfaces / Contracts

```typescript
// src/render/pool.ts

/**
 * Returns a LayoutResult where all Float32Arrays have at least `minCapacity` length.
 */
export function acquireLayoutResult(minCapacity: number): LayoutResult;

/**
 * Returns a LayoutResult to the pool for future reuse.
 */
export function releaseLayoutResult(result: LayoutResult): void;

/**
 * Clears the pool. Useful for testing or aggressive memory cleanup.
 */
export function clearLayoutPool(): void;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `pool.ts` | Test that `acquireLayoutResult` returns arrays of correct capacity, that `release` makes them available again, and that growing works. |
| Integration | `app.ts` pipeline | Ensure `reflow` and `commit` still work correctly when using recycled buffers. Test with rapid signal updates to ensure no cross-contamination of layout data. |

## Migration / Rollout

No migration required. This is a transparent internal engine change.

## Open Questions

- [ ] Does `commit()` or `ssr` need the layout arrays to persist *after* the tick? (Assumption: No, commit is synchronous and SSR renders to string synchronously).
