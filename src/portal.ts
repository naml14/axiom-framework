import type { ComponentNode, PortalNode } from './types.js'

// ============================================================
// Portal factory — creates a PortalNode for rendering children
// into an arbitrary DOM target outside the main component tree
// ============================================================

export function createPortal(
  children: ComponentNode[],
  target: HTMLElement
): PortalNode {
  return {
    type: 'portal',
    target,
    children,
  }
}
