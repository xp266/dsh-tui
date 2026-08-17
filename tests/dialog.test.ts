import { describe, expect, it } from 'vitest'
import { adjustScroll, moveFocus, rowHeight, rowTopOffset } from '../src/ui/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog.tsx'

function rows(count: number, perRow = 1): DialogRow[] {
  return Array.from({ length: count }, () => ({
    items: Array.from({ length: perRow }, (_, col) => ({ type: 'button' as const, label: `b${col}`, onPress: () => {} })),
  }))
}

describe('dialog focus navigation', () => {
  it('moves vertically and resets to the first horizontal item', () => {
    expect(moveFocus(rows(3), { row: 1, col: 1 }, 'up')).toEqual({ row: 0, col: 0 })
    expect(moveFocus(rows(3), { row: 0, col: 0 }, 'down')).toEqual({ row: 1, col: 0 })
  })

  it('clamps at the top and bottom rows', () => {
    expect(moveFocus(rows(3), { row: 0, col: 0 }, 'up')).toEqual({ row: 0, col: 0 })
    expect(moveFocus(rows(3), { row: 2, col: 0 }, 'down')).toEqual({ row: 2, col: 0 })
  })

  it('moves horizontally within the row only', () => {
    expect(moveFocus(rows(3, 2), { row: 1, col: 0 }, 'right')).toEqual({ row: 1, col: 1 })
    expect(moveFocus(rows(3, 2), { row: 1, col: 1 }, 'right')).toEqual({ row: 1, col: 1 })
    expect(moveFocus(rows(3, 2), { row: 1, col: 1 }, 'left')).toEqual({ row: 1, col: 0 })
    expect(moveFocus(rows(3, 2), { row: 1, col: 0 }, 'left')).toEqual({ row: 1, col: 0 })
  })

  it('survives an empty row list', () => {
    expect(moveFocus([], { row: 0, col: 0 }, 'down')).toEqual({ row: 0, col: 0 })
  })
})

describe('dialog row heights', () => {
  const inputRow: DialogRow = {
    items: [{ type: 'input', label: 'L', value: '', onChange: () => {} }],
  }

  it('measures input and select rows as three lines and others as one', () => {
    expect(rowHeight(rows(1)[0])).toBe(1)
    expect(rowHeight(inputRow)).toBe(3)
    expect(rowHeight({ items: [{ type: 'select', label: 'S', value: 'a', options: ['a'], onChange: () => {} }] })).toBe(3)
  })

  it('accumulates row offsets', () => {
    expect(rowTopOffset([rows(1)[0], inputRow, rows(1)[0]], 0)).toBe(0)
    expect(rowTopOffset([rows(1)[0], inputRow, rows(1)[0]], 1)).toBe(1)
    expect(rowTopOffset([rows(1)[0], inputRow, rows(1)[0]], 2)).toBe(4)
  })
})

describe('modal scroll adjustment', () => {
  it('keeps the focused row visible in the content window', () => {
    const flat = rows(20)
    expect(adjustScroll(flat, { row: 0, col: 0 }, 5, 5)).toBe(0)
    expect(adjustScroll(flat, { row: 4, col: 0 }, 5, 5)).toBe(4)
    expect(adjustScroll(flat, { row: 9, col: 0 }, 5, 5)).toBe(5)
    expect(adjustScroll(flat, { row: 10, col: 0 }, 5, 5)).toBe(6)
  })

  it('accounts for three-line input rows', () => {
    const mixed: DialogRow[] = [
      { items: [{ type: 'button', label: 'b', onPress: () => {} }] },
      { items: [{ type: 'input', label: 'i', value: '', onChange: () => {} }] },
    ]
    expect(adjustScroll(mixed, { row: 1, col: 0 }, 0, 2)).toBe(2)
    expect(adjustScroll(mixed, { row: 0, col: 0 }, 4, 2)).toBe(0)
  })
})