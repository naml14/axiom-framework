import type { PreparedComponent, LayoutResult } from '../../core/types.js'
import { getNodeIndex, getTextHandle, getTextContent } from '../prepare.js'

// ============================================================
// Shared text measurement helper
// charWidth=8px, wordWrapFactor=1.4 for prose text
// ============================================================

const CHAR_WIDTH = 8
const WORD_WRAP_FACTOR = 1.4

/**
 * Measures a text child node and writes width/height into `result`.
 * Used by flex, grid, and fast-path engines to ensure consistent behavior.
 */
export function measureTextChild(
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
    const clampedWidth = Math.max(0, availableWidth)
    const charsPerLine = Math.max(1, Math.floor(clampedWidth / CHAR_WIDTH))
    // Word-wrap factor: real text wraps at word boundaries before char limit.
    // Long words cause early line breaks. 1.4x provides sufficient margin for prose.
    const lineCount = Math.max(1, Math.ceil((text.length / charsPerLine) * WORD_WRAP_FACTOR))
    result.height[idx] = lineCount * lineHeight
    result.width[idx] = clampedWidth
  }
}
