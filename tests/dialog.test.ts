import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { adjustScroll, clampFocus, filterRowsWithHeaders, moveFocus, rowBlockSpan, rowHeight, rowTopOffset, selectableSpan, snapRow } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'
import { actionPositions, renderRow, selectBlock } from '../src/ui/dialog/dialog-item.tsx'

function rows(count: number, perRow = 1): DialogRow[] {
  return Array.from({ length: count }, () => ({
    items: Array.from({ length: perRow }, (_, col) => ({ type: 'button' as const, label: `b${col}`, onPress: () => {} })),
  }))
}

function headerRow(label = 'Recent', leadingBlank = false): DialogRow {
  return { items: [{ type: 'header', label, leadingBlank }] }
}

function actionsRow(): DialogRow {
  return {
    items: [{ type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => {}, onCancel: () => {} }],
  }
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

  it('skips header rows when moving vertically', () => {
    const mixed = [rows(1)[0]!, headerRow(), rows(1)[0]!]
    expect(moveFocus(mixed, { row: 0, col: 0 }, 'down')).toEqual({ row: 2, col: 0 })
    expect(moveFocus(mixed, { row: 2, col: 0 }, 'up')).toEqual({ row: 0, col: 0 })
  })

  it('stays put when every neighbor in a direction is a header', () => {
    expect(moveFocus([headerRow(), rows(1)[0]!], { row: 1, col: 0 }, 'up')).toEqual({ row: 1, col: 0 })
    expect(moveFocus([rows(1)[0]!, headerRow()], { row: 0, col: 0 }, 'down')).toEqual({ row: 0, col: 0 })
  })

  it('moves between the two action buttons with left and right', () => {
    const single = [actionsRow()]
    expect(moveFocus(single, { row: 0, col: 0 }, 'right')).toEqual({ row: 0, col: 1 })
    expect(moveFocus(single, { row: 0, col: 1 }, 'right')).toEqual({ row: 0, col: 1 })
    expect(moveFocus(single, { row: 0, col: 1 }, 'left')).toEqual({ row: 0, col: 0 })
    expect(moveFocus(single, { row: 0, col: 0 }, 'left')).toEqual({ row: 0, col: 0 })
  })
})

describe('dialog focus helpers', () => {
  it('reports selectable spans per row kind', () => {
    expect(selectableSpan(rows(1)[0])).toBe(0)
    expect(selectableSpan(rows(1, 3)[0])).toBe(2)
    expect(selectableSpan(actionsRow())).toBe(1)
    expect(selectableSpan(headerRow())).toBe(0)
    expect(selectableSpan(undefined)).toBe(0)
  })

  it('snaps onto the nearest selectable row', () => {
    const mixed = [headerRow(), rows(1)[0]!, headerRow('Other', true), rows(1)[0]!]
    expect(snapRow(mixed, 0)).toBe(1)
    expect(snapRow(mixed, 2)).toBe(3)
    expect(snapRow(mixed, 99)).toBe(3)
    expect(snapRow([headerRow()], 0)).toBe(0)
  })

  it('clamps focus into range and into the row span', () => {
    const mixed = [rows(1)[0]!, headerRow(), actionsRow()]
    expect(clampFocus(mixed, { row: 9, col: 4 }, 0, 2)).toEqual({ row: 2, col: 1 })
    expect(clampFocus(mixed, { row: 0, col: 0 }, 0, 2)).toEqual({ row: 0, col: 0 })
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

  it('measures header and action rows', () => {
    expect(rowHeight(headerRow(), WIDTH)).toBe(1)
    expect(rowHeight(headerRow('Today', true), WIDTH)).toBe(2)
    expect(rowHeight(actionsRow(), WIDTH)).toBe(1)
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

  it('treats adjacent headers as part of the focused block', () => {
    const grouped: DialogRow[] = [
      headerRow('Recent'),
      rows(1)[0]!,
      headerRow('Today', true),
      rows(1)[0]!,
    ]
    expect(rowBlockSpan(grouped, 1, WIDTH)).toEqual({ top: 0, bottom: 3 })
    expect(rowBlockSpan(grouped, 3, WIDTH)).toEqual({ top: 2, bottom: 4 })
    expect(rowBlockSpan(grouped, 0, WIDTH)).toEqual({ top: 0, bottom: 0 })
  })

  it('keeps a leading header reachable after scrolling away and back', () => {
    const grouped: DialogRow[] = [headerRow('Recent'), ...rows(6)]
    const viewport = 3
    let scrollTop = adjustScroll(grouped, { row: 6, col: 0 }, 0, viewport, WIDTH)
    expect(scrollTop).toBe(4)
    for (let row = 5; row >= 1; row--) {
      scrollTop = adjustScroll(grouped, { row, col: 0 }, scrollTop, viewport, WIDTH)
    }
    expect(scrollTop).toBe(0)
  })

  it('extends the block over a trailing header below the focus', () => {
    const trailing: DialogRow[] = [rows(1)[0]!, headerRow('Other', true)]
    expect(adjustScroll(trailing, { row: 0, col: 0 }, 0, 1, WIDTH)).toBe(2)
  })
})

describe('partial row clipping', () => {
  const WIDTH = 40
  type Element = { props: Record<string, unknown> }
  function innerOf(node: ReactNode): Element {
    const row = (node as Element).props.children as Element[]
    const slot = Array.isArray(row[0]!.props.children) ? row[0]!.props.children : [row[0]!.props.children]
    return (slot as unknown[]).filter(child => child !== false && child != null).at(-1) as Element
  }
  function visibleChildren(node: ReactNode): number {
    const children = innerOf(node).props.children
    const list = Array.isArray(children) ? children : [children]
    return list.filter(child => child !== false && child != null).length
  }

  it('drops the leading blank of a clipped header', () => {
    const row: DialogRow = { items: [{ type: 'header', label: 'Today', leadingBlank: true }] }
    const full = renderRow(row, false, WIDTH, 0, 0)
    expect(visibleChildren(full)).toBe(2)
    const clipped = renderRow(row, false, WIDTH, 0, 0, null, 0, 1)
    const inner = innerOf(clipped) as Element
    expect(inner.props.text).toBe('Today')
    expect(inner.props.bold).toBe(true)
  })

  it('clips the label line of an input before its wrapped lines', () => {
    const row: DialogRow = { items: [{ type: 'input', label: 'L', value: 'aaa bbb ccc ddd', onChange: () => {} }] }
    const full = renderRow(row, false, 10, 0, 0)
    expect(visibleChildren(full)).toBe(4)
    const clipped = renderRow(row, false, 10, 0, 0, null, 0, 2)
    expect(visibleChildren(clipped)).toBe(2)
  })

  it('clips the box line of a search row', () => {
    const row: DialogRow = { items: [{ type: 'search', value: '', onChange: () => {} }] }
    const full = renderRow(row, false, WIDTH, 0, 0)
    expect(visibleChildren(full)).toBe(2)
    const clipped = renderRow(row, false, WIDTH, 0, 0, null, 0, 1)
    expect(visibleChildren(clipped)).toBe(1)
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

describe('action button positions', () => {
  it('places Submit at 20% and Cancel 20% from the right edge', () => {
    const positions = actionPositions(60, 'Submit', 'Cancel')
    expect(positions.confirmX).toBe(12)
    expect(positions.cancelX).toBe(60 - 12 - 6)
    expect(positions.cancelX + 6).toBe(48)
  })

  it('never overlaps the labels on narrow widths', () => {
    for (const width of [1, 5, 11, 13, 20]) {
      const positions = actionPositions(width, 'Submit', 'Cancel')
      expect(positions.confirmX).toBeGreaterThanOrEqual(0)
      expect(positions.cancelX).toBeGreaterThanOrEqual(positions.confirmX + 6)
    }
  })
})

describe('search filtering with group headers', () => {
  function itemRow(label: string, right?: string): DialogRow {
    return { items: [{ type: 'button', label, right, onPress: () => {} }] }
  }

  const grouped: DialogRow[] = [
    headerRow('Recent'),
    itemRow('alpha'),
    headerRow('Today', true),
    itemRow('beta'),
    itemRow('gamma'),
    headerRow('Other', true),
    itemRow('delta'),
  ]

  it('keeps headers of surviving groups and drops empty ones', () => {
    const filtered = filterRowsWithHeaders(grouped, 'al', false)
    expect(filtered).toHaveLength(2)
    expect(filtered[0]!.items[0]).toMatchObject({ type: 'header', label: 'Recent' })
    expect(filtered[1]!.items[0]).toMatchObject({ type: 'button', label: 'alpha' })
  })

  it('strips the leading blank from the first visible header', () => {
    const filtered = filterRowsWithHeaders(grouped, 'amm', false)
    expect(filtered).toHaveLength(2)
    expect(filtered[0]!.items[0]).toMatchObject({ type: 'header', label: 'Today', leadingBlank: false })
    expect(filtered[1]!.items[0]).toMatchObject({ type: 'button', label: 'gamma' })
  })

  it('matches against the right-hand text when enabled', () => {
    const source = [headerRow('Recent'), itemRow('alpha', '/work')]
    expect(filterRowsWithHeaders(source, '/wo', true)).toHaveLength(2)
    expect(filterRowsWithHeaders(source, '/wo', false)).toHaveLength(0)
  })

  it('returns everything untouched for a blank query', () => {
    expect(filterRowsWithHeaders(grouped, '   ', false)).toBe(grouped)
  })
})