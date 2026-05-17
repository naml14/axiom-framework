import type {
  LayoutConstraints,
  LayoutDimension,
  LayoutProps,
  ResponsiveLayoutProps,
} from '../../core/types.js'

// Spec: openspec/specs/responsive-breakpoints.md
//
// This module implements Axiom's container-query breakpoint model:
//
// 1. Container-Query Resolution (Spec §Requirement 1)
//    mergeBreakpointOverrides() matches each breakpoint in LayoutProps.breakpoints
//    against LayoutConstraints.maxWidth / maxHeight supplied by the reflow engine.
//    The browser viewport is never consulted here.
//
// 2. Viewport Unit Fallback (Spec §Requirement 2)
//    resolveLayoutDimension() resolves vw/vh units using:
//      viewportWidth  ?? maxWidth   (fallback to container width)
//      viewportHeight ?? maxHeight  (fallback to container height)
//    This fallback is intentional — it keeps rendering deterministic in SSR
//    and test environments where a real viewport is unavailable.
//
// 3. Additive Cascade (Spec §Requirement 3)
//    resolveAt() in src/syntax/h.ts pre-sorts breakpoints ascending by minWidth.
//    mergeBreakpointOverrides() applies them in that order via Object.assign(),
//    so the largest matching breakpoint wins on conflicting properties while
//    non-conflicting properties from smaller breakpoints are preserved.

export type ResolvedLayoutProps = Omit<ResponsiveLayoutProps, 'width' | 'height'> & {
  width?: number
  height?: number
}

const LAYOUT_UNIT_REGEX = /^(-?\d+(?:\.\d+)?)(px|%|vw|vh)$/

export function resolveResponsiveLayout(
  layout: LayoutProps | undefined,
  constraints: LayoutConstraints
): ResolvedLayoutProps | undefined {
  if (layout === undefined) return undefined

  const merged = mergeBreakpointOverrides(layout, constraints)

  return {
    ...merged,
    width: resolveLayoutDimension(merged.width, constraints, 'width'),
    height: resolveLayoutDimension(merged.height, constraints, 'height'),
  }
}

export function resolveLayoutDimension(
  value: LayoutDimension | undefined,
  constraints: LayoutConstraints,
  axis: 'width' | 'height'
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value

  const parsed = LAYOUT_UNIT_REGEX.exec(value.trim())
  if (parsed === null) return undefined

  const magnitude = Number.parseFloat(parsed[1]!)
  const unit = parsed[2]

  if (Number.isNaN(magnitude)) return undefined

  if (unit === 'px') return magnitude

  if (unit === '%') {
    const base = axis === 'width' ? constraints.maxWidth : constraints.maxHeight
    return (base * magnitude) / 100
  }

  if (unit === 'vw') {
    const viewportWidth = constraints.viewportWidth ?? constraints.maxWidth
    return (viewportWidth * magnitude) / 100
  }

  const viewportHeight = constraints.viewportHeight ?? constraints.maxHeight
  return (viewportHeight * magnitude) / 100
}

function mergeBreakpointOverrides(
  layout: LayoutProps,
  constraints: LayoutConstraints
): ResponsiveLayoutProps {
  const { breakpoints, ...base } = layout
  const merged: ResponsiveLayoutProps = { ...base }

  if (breakpoints === undefined || breakpoints.length === 0) {
    return merged
  }

  for (const breakpoint of breakpoints) {
    if (
      !matchesBreakpoint(
        breakpoint.minWidth,
        breakpoint.maxWidth,
        breakpoint.minHeight,
        breakpoint.maxHeight,
        constraints.maxWidth,
        constraints.maxHeight
      )
    ) {
      continue
    }
    Object.assign(merged, breakpoint.layout)
  }

  return merged
}

export function matchesBreakpoint(
  minWidth: number | undefined,
  maxWidth: number | undefined,
  minHeight: number | undefined,
  maxHeight: number | undefined,
  width: number,
  height: number
): boolean {
  if (minWidth !== undefined && width < minWidth) return false
  if (maxWidth !== undefined && width > maxWidth) return false
  if (minHeight !== undefined && height < minHeight) return false
  if (maxHeight !== undefined && height > maxHeight) return false
  return true
}
