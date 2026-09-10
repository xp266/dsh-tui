export const CHROME_MARGIN_X = 2
export const CHROME_PAD_X = 2
export const CHROME_TEXT_X = CHROME_MARGIN_X + CHROME_PAD_X
export const CHROME_FRAME_ROWS = 4

export const MESSAGE_INPUT_GAP_ROWS = 1
export const HINT_INPUT_GAP_ROWS = 1

export const INPUT_WIDTH_OFFSET = CHROME_MARGIN_X * 2 + CHROME_PAD_X * 2

/** Bubble text inset: left margin + pad + the matching right margin. */
export const BUBBLE_WIDTH_OFFSET = CHROME_MARGIN_X * 2 + CHROME_PAD_X
export const HEADER_LABEL_COL = 4
/** The scrollbar rides the last column, one gap column right of the bubble. */
export const SCROLLBAR_COL_FROM_EDGE = 1
export const SCROLLBAR_GAP_COLS = 1

export function inputFrameTop(rows: number, realRows: number): number {
  return rows - CHROME_FRAME_ROWS - realRows
}

export function inputStatusRow(rows: number): number {
  return rows - CHROME_FRAME_ROWS + 1
}

export function hintBlockTop(rows: number, inputHeight: number, visibleCount: number): number {
  return Math.max(0, rows - inputHeight - MESSAGE_INPUT_GAP_ROWS - visibleCount)
}
