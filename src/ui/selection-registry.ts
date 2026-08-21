import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'
import { colToCharIndex, textWidth } from '../utils/text.ts'

export interface RowPiece {
  col: number
  text: string
  layer?: 'chrome' | 'message'
}

const rows = new Map<number, Map<object, RowPiece>>()

export function registerRowPiece(id: object, y: number, piece: RowPiece | null): void {
  let pieces = rows.get(y)
  if (piece === null) {
    if (pieces !== undefined) {
      pieces.delete(id)
      if (pieces.size === 0) rows.delete(y)
    }
    return
  }
  if (pieces === undefined) {
    pieces = new Map()
    rows.set(y, pieces)
  }
  pieces.set(id, piece)
}

export function rowPieces(y: number): RowPiece[] {
  const pieces = rows.get(y)
  if (pieces === undefined) return []
  return [...pieces.values()].sort((a, b) => a.col - b.col)
}

function visiblePieces(y: number): RowPiece[] {
  const pieces = rowPieces(y)
  const chrome = pieces.filter(piece => piece.layer !== 'message')
  return chrome.length > 0 ? chrome : pieces
}

export function clearRowPieces(): void {
  rows.clear()
}

export function envelopeOf(selection: LineSelection): { start: number; end: number } {
  return {
    start: Math.min(selection.anchorCol, selection.focusCol),
    end: Math.max(selection.anchorCol, selection.focusCol),
  }
}

export function envelopeOverlaps(selection: LineSelection, col: number, width: number): boolean {
  const env = envelopeOf(selection)
  return env.end > col && env.start < col + width
}

export function sliceByColumns(text: string, startCol: number, endCol: number): string {
  const startIndex = colToCharIndex(text, Math.max(0, startCol))
  const endIndex = colToCharIndex(text, Math.max(0, endCol))
  return text.slice(startIndex, endIndex)
}

export function chromeSelectionText(selection: LineSelection): string {
  const top = Math.min(selection.anchorRow, selection.focusRow)
  const bottom = Math.max(selection.anchorRow, selection.focusRow)
  const env = envelopeOf(selection)
  const lines: string[] = []
  for (let row = top; row <= bottom; row++) {
    const range = selectedRange(selection, row)
    if (range === null) continue
    let line = ''
    let prevEnd = -1
    for (const piece of visiblePieces(row)) {
      const width = textWidth(piece.text)
      if (!(env.end > piece.col && env.start < piece.col + width)) continue
      const start = Math.max(range.start, piece.col)
      const end = Math.min(range.end, piece.col + width)
      if (start >= end) continue
      const text = sliceByColumns(piece.text, start - piece.col, end - piece.col)
      if (text === '') continue
      if (line !== '') line += prevEnd === piece.col ? '' : ' '
      line += text
      prevEnd = piece.col + width
    }
    lines.push(line)
  }
  return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}
