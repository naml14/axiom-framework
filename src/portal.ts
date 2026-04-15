import type { ComponentNode, PortalNode } from './types.js'

// ============================================================
// Portal factory — creates a PortalNode for rendering children
// into an arbitrary DOM target outside the main component tree
// ============================================================

/**
 * Renders `children` into `target` — a DOM element outside the main app root —
 * while keeping them part of the component tree for reactivity and lifecycle.
 *
 * ## CSS-managed behavior (current default)
 *
 * Portal children are **CSS-managed by default**: Axiom inserts them into the
 * DOM but does NOT apply `position`, `transform`, `width`, or `height` inline
 * styles. The user's CSS controls layout entirely.
 *
 * This is intentional for the common cases (modals, tooltips, drawers,
 * notifications) where components rely on `position: fixed`, `display: flex`,
 * or `backdrop-filter` — styles that Axiom's absolute positioning would override.
 *
 * ## Future: `cssManaged` flag (not yet implemented — see issue #9)
 *
 * For portals that render into a layout-controlled container (e.g., a carousel
 * track, virtual list viewport, split-pane panel) and need Axiom's two-phase
 * layout engine to calculate positions and sizes, a `cssManaged: false` option
 * is planned:
 *
 * ```ts
 * // Future API (not available yet):
 * createPortal(children, target, { cssManaged: false })
 * ```
 *
 * When `cssManaged: false`, Axiom would apply `position: absolute` and
 * `transform: translate(x,y)` to portal children exactly like regular elements.
 * Track progress at: https://github.com/naml14/axiom-framework/issues/9
 *
 * ## Recommended usage
 *
 * Use a **dedicated container element** as the target, not `document.body`
 * directly. Axiom tracks and removes only the nodes it inserted, so shared
 * containers are safe — but a dedicated container makes intent explicit:
 *
 * ```ts
 * const modalRoot = document.getElementById('modal-root')!
 * const modal = createPortal([...children], modalRoot)
 * ```
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
