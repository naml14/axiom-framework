# Tasks: Memory Pooling for Layout Engines

## Phase 1: Foundation (Pool Implementation)

- [x] 1.1 Create `src/render/pool.ts`. Implement `acquireLayoutResult(minCapacity)` which returns a `LayoutResult` from a LIFO array. If the pool is empty or the top buffer's `.length` is less than `minCapacity`, create a new one.
- [x] 1.2 Implement `releaseLayoutResult(result)` in `src/render/pool.ts` to push a used buffer back onto the LIFO stack.
- [x] 1.3 Implement `clearLayoutPool()` in `src/render/pool.ts` to empty the stack (useful for tests/HMR).
- [x] 1.4 Create `tests/pool.test.ts` to verify LIFO behavior, capacity growth (discarding small buffers for larger ones), and clearing the pool.

## Phase 2: Core Integration (Reflow & App)

- [x] 2.1 Modify `src/render/reflow.ts` (around line 36). Replace `new Float32Array(count)` allocations with a call to `acquireLayoutResult(count)`. Ensure `reflow` returns this acquired result up the call stack to `app.ts`.
- [x] 2.2 Modify `src/app.ts`. In the `flushScheduler` (or equivalent tick function), capture the `LayoutResult` returned by `reflow`. After `commit(result, ...)` has successfully executed, call `releaseLayoutResult(result)`.
- [x] 2.3 Update `src/ssr.ts` and `src/ssr-stream.ts`. Ensure that if they call `reflow` and get a `LayoutResult`, they also call `releaseLayoutResult` after generating the HTML string to avoid leaking memory on the server.

## Phase 3: Verification & Benchmarking

- [x] 3.1 Run `bun test` to ensure all 562 existing tests pass, proving that recycled buffers do not introduce stale data or layout artifacts.
- [x] 3.2 Run `bun run typecheck` to ensure the new pool module and updated signatures are fully type-safe.
- [ ] 3.3 Verify visually using `demo/index.html` (via dev server) that resizing the window rapidly does not degrade frame rate or cause visual glitches.
