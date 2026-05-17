// ============================================================
// Shared text measurement helper
// Pure, stateless — owns charWidth and wordWrapFactor constants
// ============================================================

export interface FontData {
  availableWidth: number
  lineHeight: number
}

const CHAR_WIDTH = 8
const WORD_WRAP_FACTOR = 1.4

/**
 * Measures the bounding box of a text string given available width and line height.
 *
 * @param text - The text content to measure.
 * @param font - Available width and line height for the measurement context.
 * @param wordWrap - When true, applies the 1.4× word-wrap factor to account for
 *   real word-boundary wrapping happening before the character limit.
 * @returns `{ width, height }` — width equals `font.availableWidth`; height is
 *   the number of lines multiplied by `font.lineHeight`.
 */
export function measureTextChild(
  text: string,
  font: FontData,
  wordWrap: boolean
): { width: number; height: number } {
  const charsPerLine = Math.max(1, Math.floor(font.availableWidth / CHAR_WIDTH))
  const rawRatio = text.length / charsPerLine
  const lineCount = wordWrap
    ? Math.max(1, Math.ceil(rawRatio * WORD_WRAP_FACTOR))
    : Math.max(1, Math.ceil(rawRatio))

  return {
    width: font.availableWidth,
    height: lineCount * font.lineHeight,
  }
}
