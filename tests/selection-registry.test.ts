import { afterEach, describe, expect, it } from 'vitest'
import {
  chromeSelectionText,
  clearRowPieces,
  envelopeOverlaps,
  registerRowPiece,
  rowPieces,
} from '../src/ui/selection-registry.ts'
import type { LineSelection } from '../src/model/selection.ts'

function sel(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number): LineSelection {
  return { anchorRow, anchorCol, focusRow, focusCol, inMessage: false }
}

afterEach(() => {
  clearRowPieces()
})

describe('row piece registry', () => {
  it('returns pieces sorted by column', () => {
    const a = {}
    const b = {}
    registerRowPiece(a, 3, { col: 40, text: 'right' })
    registerRowPiece(b, 3, { col: 4, text: 'left' })
    expect(rowPieces(3).map(piece => piece.text)).toEqual(['left', 'right'])
  })

  it('removes a piece on unregister and drops empty rows', () => {
    const a = {}
    const b = {}
    registerRowPiece(a, 3, { col: 4, text: 'left' })
    registerRowPiece(b, 3, { col: 40, text: 'right' })
    registerRowPiece(a, 3, null)
    expect(rowPieces(3).map(piece => piece.text)).toEqual(['right'])
    registerRowPiece(b, 3, null)
    expect(rowPieces(3)).toEqual([])
  })

  it('replaces the piece when the same id re-registers', () => {
    const a = {}
    registerRowPiece(a, 2, { col: 4, text: 'old' })
    registerRowPiece(a, 2, { col: 4, text: 'new' })
    expect(rowPieces(2).map(piece => piece.text)).toEqual(['new'])
  })
})

describe('envelopeOverlaps', () => {
  it('matches overlap and rejects disjoint extents', () => {
    const selection = sel(0, 6, 4, 10)
    expect(envelopeOverlaps(selection, 4, 4)).toBe(true)
    expect(envelopeOverlaps(selection, 0, 4)).toBe(false)
    expect(envelopeOverlaps(selection, 9, 5)).toBe(true)
    expect(envelopeOverlaps(selection, 10, 5)).toBe(false)
    expect(envelopeOverlaps(selection, 11, 5)).toBe(false)
  })
})

describe('chromeSelectionText', () => {
  it('extracts only pieces overlapping the horizontal envelope', () => {
    const a = {}
    const b = {}
    registerRowPiece(a, 5, { col: 4, text: 'Context 0%' })
    registerRowPiece(b, 5, { col: 40, text: '~/ts/dsh-tui' })
    expect(chromeSelectionText(sel(5, 42, 5, 50))).toBe('ts/dsh-t')
    expect(chromeSelectionText(sel(5, 4, 5, 12))).toBe('Context')
  })

  it('joins left and right clusters with a single space when both are covered', () => {
    const a = {}
    const b = {}
    registerRowPiece(a, 5, { col: 4, text: 'Context 0%' })
    registerRowPiece(b, 5, { col: 40, text: '~/ts' })
    expect(chromeSelectionText(sel(5, 4, 5, 44))).toBe('Context 0% ~/ts')
  })

  it('gates mid rows by the envelope while end rows slice by range', () => {
    const a = {}
    const b = {}
    const c = {}
    registerRowPiece(a, 1, { col: 4, text: 'model-a' })
    registerRowPiece(b, 2, { col: 4, text: 'model-b' })
    registerRowPiece(c, 3, { col: 4, text: 'model-c' })
    expect(chromeSelectionText(sel(1, 6, 3, 9))).toBe('del-a\nmodel-b\nmodel')
  })

  it('splits a focused row into its label and right parts by the envelope', () => {
    const a = {}
    const b = {}
    registerRowPiece(a, 7, { col: 2, text: 'session name'.padEnd(30) })
    registerRowPiece(b, 7, { col: 32, text: '~/ws/session' })
    expect(chromeSelectionText(sel(7, 33, 7, 38))).toBe('/ws/s')
  })

  it('trims trailing empties from the block', () => {
    const a = {}
    registerRowPiece(a, 2, { col: 4, text: 'only line' })
    expect(chromeSelectionText(sel(2, 4, 6, 20))).toBe('only line')
  })

  it('prefers chrome pieces over hidden message pieces on overlapped rows', () => {
    const msg = {}
    const dialog = {}
    registerRowPiece(msg, 4, { col: 4, text: 'hidden bubble text', layer: 'message' })
    registerRowPiece(dialog, 4, { col: 6, text: 'dialog item' })
    expect(chromeSelectionText(sel(4, 6, 4, 12))).toBe('dialog')
    registerRowPiece(dialog, 4, null)
    expect(chromeSelectionText(sel(4, 4, 4, 12))).toBe('hidden b')
  })
})
