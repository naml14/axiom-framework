import type { ComponentNode, PortalNode } from '../core/types.js'

// ============================================================
// Portal factory — creates a PortalNode for rendering children
// into an arbitrary DOM target outside the main component tree
// ============================================================

/**
 * Renders `children` into `target` — a DOM element outside the main app root —
 * while keeping them part of the component tree for reactivity and lifecycle.
 *
 * ## CSS-managed vs framework-managed children
 *
 * The `cssManaged` option (added in v0.9.11) controls whether Axiom applies
 * layout styles to the portal's children:
 *
 * - **`cssManaged: true`** (default) — portal children are inserted into the
 *   DOM but Axiom does NOT apply `position`, `transform`, `width`, or `height`
 *   inline styles. The user's CSS controls layout entirely. This is the
 *   right choice for modals, tooltips, drawers, and notifications that rely
 *   on `position: fixed`, `display: flex`, or `backdrop-filter` — styles that
 *   Axiom's absolute positioning would otherwise override.
 *
 *   ```ts
 *   const modal = createPortal([...children], modalRoot)
 *   ```
 *
 * - **`cssManaged: false`** — Axiom applies `position: absolute` and
 *   `transform: translate(x,y)` to portal children exactly like regular
 *   elements. Use this for portals that render into a layout-controlled
 *   container (e.g., a carousel track, virtual list viewport, split-pane
 *   panel) where you want Axiom's two-phase layout engine to calculate
 *   positions and sizes.
 *
 *   ```ts
 *   const track = createPortal([...children], trackRoot, { cssManaged: false })
 *   ```
 *
 * ## Recommended usage
 *
 * Use a **dedicated container element** as the target, not `document.body`
 * directly. Axiom tracks and removes only the nodes it inserted, so shared
 * containers are safe — but a dedicated container makes intent explicit:
 *
 * ```ts
 * const modalRoot = document.getElementById('modal-root')!
 * const modal = createPortal([...children], modalRoot)  // cssManaged: true
 * ```
 *
 * See CHANGELOG.md (v0.9.11) for the commit that introduced the option.
 */
export function createPortal(
  children: ComponentNode[],
  target: HTMLElement,
  options?: { cssManaged?: boolean }
): PortalNode {
  const node: PortalNode = {
    type: 'portal',
    target,
    children,
  }
  if (options?.cssManaged !== undefined) {
    node.cssManaged = options.cssManaged
  }
  return node
}
