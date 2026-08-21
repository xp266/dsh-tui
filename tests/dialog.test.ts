import { describe, expect, it } from 'vitest'
import { adjustScroll, moveFocus, rowHeight, rowTopOffset } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'
import { selectBlock } from '../src/ui/dialog/dialog-item.tsx'

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
  const WIDTH = 40
  const inputRow: DialogRow = {
    items: [{ type: 'input', label: 'L', value: '', onChange: () => {} }],
  }

  it('measures input rows as three lines, select and others as one', () => {
    expect(rowHeight(rows(1)[0]!, WIDTH)).toBe(1)
    expect(rowHeight(inputRow, WIDTH)).toBe(3)
    expect(rowHeight({ items: [{ type: 'select', label: 'S', value: 'a', options: ['a'], onChange: () => {} }] }, WIDTH)).toBe(1)
  })

  it('measures spaced select rows as two lines', () => {
    expect(rowHeight({ items: [{ type: 'select', label: 'S', value: 'a', options: ['a'], onChange: () => {}, spaced: true }] }, WIDTH)).toBe(2)
  })

  it('grows input rows by one line per wrapped value line', () => {
    const long: DialogRow = { items: [{ type: 'input', label: 'L', value: 'x'.repeat(100), onChange: () => {} }] }
    expect(rowHeight(long, WIDTH)).toBe(2 + Math.ceil(100 / WIDTH))
    expect(rowHeight(long, 10)).toBe(12)
  })

  it('accumulates row offsets', () => {
    expect(rowTopOffset([rows(1)[0]!, inputRow, rows(1)[0]!], 0, WIDTH)).toBe(0)
    expect(rowTopOffset([rows(1)[0]!, inputRow, rows(1)[0]!], 1, WIDTH)).toBe(1)
    expect(rowTopOffset([rows(1)[0]!, inputRow, rows(1)[0]!], 2, WIDTH)).toBe(4)
  })
})

describe('modal scroll adjustment', () => {
  const WIDTH = 40
  it('keeps the focused row visible in the content window', () => {
    const flat = rows(20)
    expect(adjustScroll(flat, { row: 0, col: 0 }, 5, 5, WIDTH)).toBe(0)
    expect(adjustScroll(flat, { row: 4, col: 0 }, 5, 5, WIDTH)).toBe(4)
    expect(adjustScroll(flat, { row: 9, col: 0 }, 5, 5, WIDTH)).toBe(5)
    expect(adjustScroll(flat, { row: 10, col: 0 }, 5, 5, WIDTH)).toBe(6)
  })

  it('accounts for three-line input rows', () => {
    const mixed: DialogRow[] = [
      { items: [{ type: 'button', label: 'b', onPress: () => {} }] },
      { items: [{ type: 'input', label: 'i', value: '', onChange: () => {} }] },
    ]
    expect(adjustScroll(mixed, { row: 1, col: 0 }, 0, 2, WIDTH)).toBe(2)
    expect(adjustScroll(mixed, { row: 0, col: 0 }, 4, 2, WIDTH)).toBe(0)
  })

  it('accounts for grown wrapped input rows', () => {
    const mixed: DialogRow[] = [
      { items: [{ type: 'button', label: 'b', onPress: () => {} }] },
      { items: [{ type: 'input', label: 'i', value: 'x'.repeat(80), onChange: () => {} }] },
    ]
    expect(adjustScroll(mixed, { row: 1, col: 0 }, 0, 2, WIDTH)).toBe(3)
  })

  it('scrolls content rows only, so the fixed search row never strands the list', () => {
    const flat = rows(20)
    const viewport = 5
    const scrolled = adjustScroll(flat, { row: 19, col: 0 }, 0, viewport, WIDTH)
    expect(scrolled).toBe(15)
    expect(adjustScroll(flat, { row: 0, col: 0 }, scrolled, viewport, WIDTH)).toBe(0)
  })
})

describe('carousel select block', () => {
  it('occupies 60% of the content width and sits at the right edge', () => {
    const block = selectBlock(60, 'openai-completions')
    expect(block.blockWidth).toBe(36)
    expect(block.blockStart).toBe(24)
    expect(block.blockStart + block.blockWidth).toBe(60)
  })

  it('centers the value between the arrow buttons', () => {
    const block = selectBlock(60, 'openai-completions')
    expect(block.text).toBe('openai-completions')
    expect(block.cursorX).toBe(3 + Math.floor((36 - 6 - 18) / 2) + 18)
    expect(block.cursorX).toBeLessThan(block.blockWidth - 3)
  })

  it('truncates long values to the inner width', () => {
    const block = selectBlock(20, 'x'.repeat(50))
    expect(block.blockWidth).toBe(12)
    expect(block.text).toHaveLength(6)
  })

  it('centers a single option across the whole block', () => {
    const block = selectBlock(60, 'standard')
    expect(block.fullLeftPad).toBe(Math.floor((36 - 8) / 2))
    expect(block.fullLeftPad + 8).toBeLessThanOrEqual(36)
  })
})