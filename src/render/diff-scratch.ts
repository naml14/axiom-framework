// ============================================================
// Scratch pool for diff maps and sets.
//
// fullDiff() allocates 4-6 Maps and Sets per call: prevByIndex, newByIndex,
// portalMap, layoutChangedSet, allChangedSet, prevIndices, newIndices,
// prevByKey. In a 60fps reactive tree this generates hundreds of Map/Set
// allocations per second, each followed by O(n) entries.
//
// This module provides a module-scoped scratch pool of three Maps and two Sets
// that are cleared (not re-allocated) at the start of each fullDiff call.
// Cleared Maps/Sets are O(n) to clear but the n here is bounded by the tree
// size, which is the same as what a fresh allocation would walk during GC.
// ============================================================

/**
 * A scratch object holding all reusable Maps and Sets used by fullDiff.
 * Cleared at the start of each call.
 */
interface DiffScratch {
  prevByIndex: Map<number, import('../core/types.js').PreparedComponent>
  newByIndex: Map<number, import('../core/types.js').PreparedComponent>
  portalMap: Map<number, { target: HTMLElement; cssManaged: boolean }>
  prevByKey: Map<string, number>
  newByKey: Map<string, number>
  prevIndices: Set<number>
  newIndices: Set<number>
  layoutChangedSet: Set<number>
  allChangedSet: Set<number>
}

/**
 * Single module-scoped scratch object. Reused across calls — maps and sets
 * are cleared with `.clear()` instead of being re-allocated.
 */
const scratch: DiffScratch = {
  prevByIndex: new Map(),
  newByIndex: new Map(),
  portalMap: new Map(),
  prevByKey: new Map(),
  newByKey: new Map(),
  prevIndices: new Set(),
  newIndices: new Set(),
  layoutChangedSet: new Set(),
  allChangedSet: new Set(),
}

/** Reset all scratch Maps/Sets. Call at the start of each fullDiff. */
export function resetDiffScratch(): void {
  scratch.prevByIndex.clear()
  scratch.newByIndex.clear()
  scratch.portalMap.clear()
  scratch.prevByKey.clear()
  scratch.newByKey.clear()
  scratch.prevIndices.clear()
  scratch.newIndices.clear()
  scratch.layoutChangedSet.clear()
  scratch.allChangedSet.clear()
}

export function acquirePrevByIndex(): Map<number, import('../core/types.js').PreparedComponent> {
  return scratch.prevByIndex
}
export function acquireNewByIndex(): Map<number, import('../core/types.js').PreparedComponent> {
  return scratch.newByIndex
}
export function acquirePortalMap(): Map<number, { target: HTMLElement; cssManaged: boolean }> {
  return scratch.portalMap
}
export function acquirePrevByKey(): Map<string, number> {
  return scratch.prevByKey
}
export function acquireNewByKey(): Map<string, number> {
  return scratch.newByKey
}
export function acquirePrevIndices(): Set<number> {
  return scratch.prevIndices
}
export function acquireNewIndices(): Set<number> {
  return scratch.newIndices
}
export function acquireLayoutChangedSet(): Set<number> {
  return scratch.layoutChangedSet
}
export function acquireAllChangedSet(): Set<number> {
  return scratch.allChangedSet
}

/** Clear the scratch pool. Testing-only. */
export function __clearDiffScratchForTests(): void {
  resetDiffScratch()
}
