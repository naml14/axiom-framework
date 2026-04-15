import type {
  PreparedComponent,
  LayoutResult,
  LayoutProps,
  LayoutConstraints,
} from './types.js'

import {
  getNodeIndex,
  getPreparedChildren,
  getMetrics,
  getNodeType,
  getTextHandle,
  getTextContent,
  getLayoutProps,
} from './prepare.js'

import { resolveResponsiveLayout } from './responsive.js'
import { measureSimple } from './fast-path.js'
import { measureFlex } from './flex.js'

// ============================================================
// Grid MVP (Fase 2, slice 1)
// ============================================================
// Alcance intencionalmente mínimo:
// - display: grid
// - gridTemplateColumns: número fijo o repeat(N, 1fr)
// - auto-placement row-major
// - gridColumnSpan / gridRowSpan mínimos
// - columnGap / rowGap
//
// Fuera de alcance explícito:
// - areas, templateRows, auto-flow avanzado, align/justify complejos
// - paridad completa con CSS Grid
//
// Reglas deterministas de este slice:
// - spans inválidos (no enteros, no finitos, < 1) => span = 1
// - columnSpan imposible para el número fijo de columnas => span = 1
// - rectángulo explícito fuera de bounds o en conflicto => fallback a auto-placement
// ============================================================

const REPEAT_COLUMNS_REGEX = /^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/i
const PERCENT_VALUE_REGEX = /^(-?\d+(?:\.\d+)?)%$/

interface GridPlacement {
  child: PreparedComponent
  childIdx: number
  row: number
  col: number
  rowSpan: number
  colSpan: number
  childHeight: number
}

interface DeferredGridPlacement {
  child: PreparedComponent
  childIdx: number
  childHeight: number
  rowSpan: number
  colSpan: number
  fixedRow?: number
  fixedCol?: number
}

interface LocalizedSecondPassRemeasure {
  child: PreparedComponent
  childWidth: number
  childLayout: LayoutProps | undefined
}

export function measureGrid(
  prepared: PreparedComponent,
  availableWidth: number,
  availableHeight: number,
  result: LayoutResult,
  lineHeight: number,
  layout?: LayoutProps,
  constraints?: LayoutConstraints
): void {
  const resolvedLayout = resolveResponsiveLayout(layout, constraints ?? {
    maxWidth: availableWidth,
    maxHeight: availableHeight,
  })

  const children = getPreparedChildren(prepared)
  const parentIdx = getNodeIndex(prepared)
  const padding = resolvedLayout?.padding ?? 0
  const gap = resolvedLayout?.gap ?? 0
  const columnGap = resolvedLayout?.columnGap ?? gap
  const rowGap = resolvedLayout?.rowGap ?? gap

  const columns = resolveColumnCount(resolvedLayout?.gridTemplateColumns)
  const innerWidth = Math.max(0, availableWidth - padding * 2)
  const totalColumnGaps = Math.max(0, columns - 1) * columnGap
  const columnWidth = columns > 0
    ? Math.max(0, (innerWidth - totalColumnGaps) / columns)
    : innerWidth

  const rowHeights: number[] = []
  const placements: GridPlacement[] = []
  const deferredQueue: DeferredGridPlacement[] = []
  const secondPassVerticalPercentByChildIdx = new Map<number, number>()
  const localizedSecondPassRemeasureByChildIdx = new Map<number, LocalizedSecondPassRemeasure>()
  const occupiedCells = new Set<string>()

  for (const child of children) {
    const childIdx = getNodeIndex(child)

    // Portals: transparentes al layout del parent
    if (getNodeType(child) === 'portal') {
      result.width[childIdx] = 0
      result.height[childIdx] = 0
      continue
    }

    const seedConstraints: LayoutConstraints = {
      maxWidth: columnWidth,
      maxHeight: availableHeight,
      viewportWidth: constraints?.viewportWidth,
      viewportHeight: constraints?.viewportHeight,
    }

    const seedLayout = resolveResponsiveLayout(getLayoutProps(child), seedConstraints)
    const seedColSpan = normalizeGridSpan(seedLayout?.gridColumnSpan, columns)
    const seededSpannedWidth = resolveSpannedWidth(columnWidth, columnGap, seedColSpan)

    const effectiveConstraints: LayoutConstraints = {
      maxWidth: seededSpannedWidth,
      maxHeight: availableHeight,
      viewportWidth: constraints?.viewportWidth,
      viewportHeight: constraints?.viewportHeight,
    }

    const childLayout = resolveResponsiveLayout(getLayoutProps(child), effectiveConstraints)

    const rowSpan = normalizeGridSpan(childLayout?.gridRowSpan)
    const colSpan = normalizeGridSpan(childLayout?.gridColumnSpan, columns)
    const spannedWidth = resolveSpannedWidth(columnWidth, columnGap, colSpan)
    const childWidth = childLayout?.width ?? spannedWidth
    let childHeight = childLayout?.height ?? 0
    const explicitCol = normalizeGridIndex(childLayout?.gridColumn)
    const explicitRow = normalizeGridIndex(childLayout?.gridRow)

    const percentHeight = resolvePercentHeight(getLayoutProps(child)?.height)
    let determinableSpanHeightForFirstPass: number | undefined

    if (percentHeight !== undefined && rowSpan > 1 && explicitRow !== undefined) {
      determinableSpanHeightForFirstPass = resolveDeterminableVerticalSpanHeight(
        rowHeights,
        explicitRow - 1,
        rowSpan,
        rowGap
      )

      if (determinableSpanHeightForFirstPass !== undefined) {
        childHeight = (determinableSpanHeightForFirstPass * percentHeight) / 100
      }
    }

    const needsSecondPassLocalizedRemeasure =
      percentHeight !== undefined
      && rowSpan > 1
      && determinableSpanHeightForFirstPass === undefined

    if (needsSecondPassLocalizedRemeasure) {
      // Segundo pase mínimo: evitar contaminar alturas de fila antes de conocer el row de auto-placement.
      // Conservamos constraints para medir hijos, pero diferimos la normalización vertical del item.
      childHeight = 0
      secondPassVerticalPercentByChildIdx.set(childIdx, percentHeight)
      localizedSecondPassRemeasureByChildIdx.set(childIdx, {
        child,
        childWidth,
        childLayout,
      })
    }

    const childConstraints: LayoutConstraints = {
      maxWidth: childWidth,
      maxHeight: childHeight > 0 ? childHeight : availableHeight,
      viewportWidth: constraints?.viewportWidth,
      viewportHeight: constraints?.viewportHeight,
    }

    result.width[childIdx] = childWidth
    result.height[childIdx] = childHeight

    if (needsSecondPassLocalizedRemeasure) {
      // Re-medición localizada en segundo pase usando la altura final normalizada.
      // Evita forzar un segundo reflow global y mantiene offsets de siblings no afectados.
    } else if (getNodeType(child) === 'text') {
      measureTextChild(child, childWidth, result, lineHeight)
      childHeight = result.height[childIdx] ?? 0
    } else if (getNodeType(child) === 'element' && getPreparedChildren(child).length > 0) {
      const nestedAvailableHeight = childHeight > 0 ? childHeight : availableHeight
      measureGridChildContents(
        child,
        childWidth,
        nestedAvailableHeight,
        result,
        lineHeight,
        childLayout,
        childConstraints
      )
      childHeight = result.height[childIdx] ?? childHeight
    }

    if (explicitCol !== undefined && explicitRow !== undefined) {
      const row = explicitRow - 1
      const col = explicitCol - 1

      if (canPlaceRectangle(occupiedCells, row, col, rowSpan, colSpan, columns)) {
        reserveRectangle(occupiedCells, row, col, rowSpan, colSpan)
        registerPlacement(placements, rowHeights, {
          child,
          childIdx,
          row,
          col,
          rowSpan,
          colSpan,
          childHeight,
        })
      } else {
        deferredQueue.push({ child, childIdx, childHeight, rowSpan, colSpan })
      }
    } else if (explicitRow !== undefined) {
      deferredQueue.push({
        child,
        childIdx,
        childHeight,
        rowSpan,
        colSpan,
        fixedRow: explicitRow - 1,
      })
    } else if (explicitCol !== undefined) {
      deferredQueue.push({
        child,
        childIdx,
        childHeight,
        rowSpan,
        colSpan,
        fixedCol: explicitCol - 1,
      })
    } else {
      deferredQueue.push({ child, childIdx, childHeight, rowSpan, colSpan })
    }
  }

  for (const queued of deferredQueue) {
    let location: { row: number, col: number } | undefined

    if (queued.fixedRow !== undefined) {
      location = findFirstFittingRectangle(occupiedCells, columns, queued.rowSpan, queued.colSpan, {
        fixedRow: queued.fixedRow,
      })
    } else if (queued.fixedCol !== undefined) {
      location = findFirstFittingRectangle(occupiedCells, columns, queued.rowSpan, queued.colSpan, {
        fixedCol: queued.fixedCol,
      })
    }

    if (location === undefined) {
      location = findFirstFittingRectangle(occupiedCells, columns, queued.rowSpan, queued.colSpan)
    }

    if (location === undefined) {
      continue
    }

    reserveRectangle(occupiedCells, location.row, location.col, queued.rowSpan, queued.colSpan)

    registerPlacement(placements, rowHeights, {
      child: queued.child,
      childIdx: queued.childIdx,
      row: location.row,
      col: location.col,
      rowSpan: queued.rowSpan,
      colSpan: queued.colSpan,
      childHeight: queued.childHeight,
    })
  }

  // Segundo pase vertical mínimo para rowSpan + porcentaje auto-placed.
  // Regla: altura final = porcentaje sobre altura efectiva del span si ya es determinable;
  // fallback determinista = availableHeight (semántica MVP actual para % sin base resoluble).
  for (const placement of placements) {
    const percentHeight = secondPassVerticalPercentByChildIdx.get(placement.childIdx)
    if (percentHeight === undefined) {
      continue
    }

    const effectiveSpanHeight = resolveDeterminableVerticalSpanHeight(
      rowHeights,
      placement.row,
      placement.rowSpan,
      rowGap
    )

    const normalizationBase = (effectiveSpanHeight !== undefined && effectiveSpanHeight > 0)
      ? effectiveSpanHeight
      : availableHeight

    const normalizedHeight = (normalizationBase * percentHeight) / 100
    result.height[placement.childIdx] = normalizedHeight

    reconcileCoveredRowsForNormalizedSpan(
      rowHeights,
      placements,
      placement,
      normalizedHeight,
      rowGap
    )

    const localizedRemeasure = localizedSecondPassRemeasureByChildIdx.get(placement.childIdx)
    if (localizedRemeasure !== undefined && getPreparedChildren(localizedRemeasure.child).length > 0) {
      const localizedConstraints: LayoutConstraints = {
        maxWidth: localizedRemeasure.childWidth,
        maxHeight: normalizedHeight,
        viewportWidth: constraints?.viewportWidth,
        viewportHeight: constraints?.viewportHeight,
      }

      measureGridChildContents(
        localizedRemeasure.child,
        localizedRemeasure.childWidth,
        normalizedHeight,
        result,
        lineHeight,
        localizedRemeasure.childLayout,
        localizedConstraints
      )

      // Mantener semántica del segundo pase: altura del item afectado se fija por normalización.
      result.height[placement.childIdx] = normalizedHeight
    }
  }

  const rowOffsets = buildRowOffsets(rowHeights, rowGap, padding)

  for (const placement of placements) {
    const x = padding + placement.col * (columnWidth + columnGap)
    const y = rowOffsets[placement.row] ?? padding

    result.x[placement.childIdx] = x
    result.y[placement.childIdx] = y
  }

  if (result.height[parentIdx] === 0) {
    const rows = rowHeights.length
    const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0)
    const totalRowGaps = Math.max(0, rows - 1) * rowGap
    result.height[parentIdx] = contentHeight + totalRowGaps + padding * 2
  }
}

function measureGridChildContents(
  prepared: PreparedComponent,
  availableWidth: number,
  availableHeight: number,
  result: LayoutResult,
  lineHeight: number,
  layout: LayoutProps | undefined,
  constraints: LayoutConstraints
): void {
  const metrics = getMetrics(prepared)
  const hasLayoutProps = layout !== undefined
  const isGrid = layout?.display === 'grid'

  if (isGrid) {
    measureGrid(
      prepared,
      availableWidth,
      availableHeight,
      result,
      lineHeight,
      layout,
      constraints
    )
    return
  }

  if (!hasLayoutProps && metrics.simpleLayout) {
    measureSimple(prepared, availableWidth, result, lineHeight)
    return
  }

  measureFlex(
    prepared,
    availableWidth,
    availableHeight,
    result,
    lineHeight,
    layout,
    constraints
  )
}

function resolveColumnCount(template: number | string | undefined): number {
  if (typeof template === 'number') {
    return normalizeColumnCount(template)
  }

  if (typeof template === 'string') {
    const match = REPEAT_COLUMNS_REGEX.exec(template.trim())
    if (match !== null) {
      return normalizeColumnCount(Number.parseInt(match[1]!, 10))
    }
  }

  return 1
}

function normalizeColumnCount(value: number): number {
  if (!Number.isFinite(value)) return 1
  const normalized = Math.floor(value)
  if (normalized < 1) return 1
  return normalized
}

function normalizeGridIndex(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  if (normalized < 1) return undefined
  return normalized
}

function normalizeGridSpan(value: number | undefined, columns?: number): number {
  if (value === undefined) return 1
  if (!Number.isFinite(value) || !Number.isInteger(value)) return 1
  if (value < 1) return 1
  if (columns !== undefined && value > columns) return 1
  return value
}

function resolvePercentHeight(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const match = PERCENT_VALUE_REGEX.exec(value.trim())
  if (match === null) {
    return undefined
  }

  const magnitude = Number.parseFloat(match[1]!)
  if (!Number.isFinite(magnitude)) {
    return undefined
  }

  return magnitude
}

function resolveDeterminableVerticalSpanHeight(
  rowHeights: number[],
  startRow: number,
  rowSpan: number,
  rowGap: number
): number | undefined {
  let total = 0

  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
    const rowHeight = rowHeights[startRow + rowOffset]
    if (rowHeight === undefined || !Number.isFinite(rowHeight) || rowHeight <= 0) {
      return undefined
    }
    total += rowHeight
  }

  total += Math.max(0, rowSpan - 1) * rowGap
  return total
}

function reconcileCoveredRowsForNormalizedSpan(
  rowHeights: number[],
  placements: GridPlacement[],
  placement: GridPlacement,
  normalizedHeight: number,
  rowGap: number
): void {
  // Suma de alturas de las filas cubiertas incluyendo filas con altura 0 (items diferidos).
  // resolveDeterminableVerticalSpanHeight devuelve undefined para filas 0, lo que antes
  // provocaba que la reconciliación se saltara cuando múltiples spans diferidos comparten
  // las mismas filas cubiertas. Con el cálculo inline, el primer item acumula su déficit
  // completo y el segundo sólo añade lo que falta → "el máximo gana" de forma determinista.
  let currentSpanHeight = 0
  for (let offset = 0; offset < placement.rowSpan; offset++) {
    currentSpanHeight += rowHeights[placement.row + offset] ?? 0
  }
  currentSpanHeight += Math.max(0, placement.rowSpan - 1) * rowGap

  if (normalizedHeight <= currentSpanHeight) {
    return
  }

  const coveredEndRow = placement.row + placement.rowSpan - 1
  const hasLaterPlacements = placements.some((candidate) =>
    candidate.childIdx !== placement.childIdx && candidate.row > coveredEndRow
  )

  // Guardia anti-churn: si tocar filas cubiertas desplaza siblings posteriores,
  // se omite reconciliación para preservar offsets existentes de forma determinista.
  if (hasLaterPlacements) {
    return
  }

  const deficit = normalizedHeight - currentSpanHeight
  const targetRow = coveredEndRow
  const baseHeight = rowHeights[targetRow] ?? 0

  rowHeights[targetRow] = baseHeight + deficit
}

function resolveSpannedWidth(columnWidth: number, columnGap: number, colSpan: number): number {
  return columnWidth * colSpan + Math.max(0, colSpan - 1) * columnGap
}

function buildCellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function canPlaceRectangle(
  occupiedCells: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
  columns: number
): boolean {
  if (col < 0 || col + colSpan > columns) {
    return false
  }

  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
    for (let colOffset = 0; colOffset < colSpan; colOffset++) {
      if (occupiedCells.has(buildCellKey(row + rowOffset, col + colOffset))) {
        return false
      }
    }
  }

  return true
}

function reserveRectangle(
  occupiedCells: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number
): void {
  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
    for (let colOffset = 0; colOffset < colSpan; colOffset++) {
      occupiedCells.add(buildCellKey(row + rowOffset, col + colOffset))
    }
  }
}

function findFirstFittingRectangle(
  occupiedCells: Set<string>,
  columns: number,
  rowSpan: number,
  colSpan: number,
  options?: {
    fixedRow?: number
    fixedCol?: number
  }
): { row: number, col: number } | undefined {
  if (colSpan > columns) {
    return undefined
  }

  if (options?.fixedRow !== undefined) {
    const row = options.fixedRow
    const startCol = options.fixedCol ?? 0
    const endCol = options.fixedCol ?? (columns - colSpan)

    for (let col = startCol; col <= endCol; col++) {
      if (canPlaceRectangle(occupiedCells, row, col, rowSpan, colSpan, columns)) {
        return { row, col }
      }
    }

    return undefined
  }

  const searchLimit = getSearchRowLimit(occupiedCells, rowSpan)

  if (options?.fixedCol !== undefined) {
    for (let row = 0; row <= searchLimit; row++) {
      if (canPlaceRectangle(occupiedCells, row, options.fixedCol, rowSpan, colSpan, columns)) {
        return { row, col: options.fixedCol }
      }
    }

    return undefined
  }

  for (let row = 0; row <= searchLimit; row++) {
    for (let col = 0; col <= columns - colSpan; col++) {
      if (canPlaceRectangle(occupiedCells, row, col, rowSpan, colSpan, columns)) {
        return { row, col }
      }
    }
  }

  return undefined
}

function getSearchRowLimit(occupiedCells: Set<string>, rowSpan: number): number {
  let maxRow = 0

  for (const key of occupiedCells) {
    const separator = key.indexOf(':')
    const row = Number.parseInt(key.slice(0, separator), 10)

    if (Number.isFinite(row) && row > maxRow) {
      maxRow = row
    }
  }

  return Math.max(maxRow + rowSpan + 1, occupiedCells.size + rowSpan + 1)
}

function registerPlacement(
  placements: GridPlacement[],
  rowHeights: number[],
  placement: GridPlacement
): void {
  placements.push(placement)

  const distributedHeight = placement.rowSpan > 1
    ? placement.childHeight / placement.rowSpan
    : placement.childHeight

  for (let rowOffset = 0; rowOffset < placement.rowSpan; rowOffset++) {
    const row = placement.row + rowOffset
    if (rowHeights[row] === undefined || distributedHeight > rowHeights[row]!) {
      rowHeights[row] = distributedHeight
    }
  }
}

function buildRowOffsets(rowHeights: number[], rowGap: number, padding: number): number[] {
  const offsets: number[] = []
  let current = padding

  for (let row = 0; row < rowHeights.length; row++) {
    offsets[row] = current
    current += (rowHeights[row] ?? 0) + rowGap
  }

  return offsets
}

function measureTextChild(
  prepared: PreparedComponent,
  availableWidth: number,
  result: LayoutResult,
  lineHeight: number
): void {
  const idx = getNodeIndex(prepared)
  const textHandle = getTextHandle(prepared)
  let text: string | undefined

  if (textHandle !== undefined) {
    text = (textHandle as { text: string }).text
  } else {
    text = getTextContent(prepared)
  }

  if (text !== undefined && text.length > 0) {
    const charWidth = 8
    const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth))
    const lineCount = Math.max(1, Math.ceil((text.length / charsPerLine) * 1.4))
    result.height[idx] = lineCount * lineHeight
    result.width[idx] = availableWidth
  }
}
