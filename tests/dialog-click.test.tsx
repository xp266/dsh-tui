import { describe, expect, it } from 'vitest'
import { hitRowIndex } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(count: number): DialogRow[] {
  return Array.from({ length: count }, (_, i) => ({
    items: [{ type: 'button', label: `b${i}`, onPress: () => {} }],
  }))
}

const TOP = 8
const TITLE_LINES = 2

describe('dialog hitRowIndex', () => {
  it('hits the row under the cursor without the off-by-one', () => {
    const list = rows(3)
    const y = TOP + 1 + TITLE_LINES + 1
    expect(hitRowIndex(y, TOP, TITLE_LINES, list)).toBe(1)
    expect(hitRowIndex(y + 1, TOP, TITLE_LINES, list)).toBe(2)
    expect(hitRowIndex(y - 1, TOP, TITLE_LINES, list)).toBe(0)
  })

  it('returns null above the content area', () => {
    const list = rows(3)
    expect(hitRowIndex(TOP + 1, TOP, TITLE_LINES, list)).toBeNull()
  })

  it('returns null below the last row', () => {
    const list = rows(2)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 2, TOP, TITLE_LINES, list)).toBeNull()
  })

  it('handles single-line select rows', () => {
    const list: DialogRow[] = [
      rows(1)[0],
      { items: [{ type: 'select', label: 'S', value: 'a', options: ['a', 'b'], onChange: () => {} }] },
    ]
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 1, TOP, TITLE_LINES, list)).toBe(1)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 2, TOP, TITLE_LINES, list)).toBeNull()
  })

  it('maps clicks through the scroll offset', () => {
    const list = rows(20)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES, TOP, TITLE_LINES, list, 15)).toBe(15)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 4, TOP, TITLE_LINES, list, 15)).toBe(19)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 5, TOP, TITLE_LINES, list, 15)).toBeNull()
  })

  it('maps dialog clicks onto content rows below the fixed search row', () => {
    const list: DialogRow[] = [
      { items: [{ type: 'select', label: 'A', value: 'a', options: ['a', 'b'], onChange: () => {}, spaced: true }] },
      { items: [{ type: 'select', label: 'B', value: 'b', options: ['a', 'b'], onChange: () => {}, spaced: true }] },
    ]
    const fixedHeight = 2
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + fixedHeight, TOP + fixedHeight, TITLE_LINES, list, 0)).toBe(0)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + fixedHeight + 1, TOP + fixedHeight, TITLE_LINES, list, 0)).toBe(0)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + fixedHeight + 2, TOP + fixedHeight, TITLE_LINES, list, 0)).toBe(1)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + fixedHeight + 4, TOP + fixedHeight, TITLE_LINES, list, 0)).toBeNull()
  })

  it('maps clicks onto wrapped input rows using the dialog width', () => {
    const list: DialogRow[] = [
      { items: [{ type: 'input', label: 'URL', value: 'x'.repeat(80), onChange: () => {} }] },
      { items: [{ type: 'button', label: 'save', onPress: () => {} }] },
    ]
    expect(hitRowIndex(TOP + 1 + TITLE_LINES, TOP, TITLE_LINES, list, 0, 40)).toBe(0)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 2, TOP, TITLE_LINES, list, 0, 40)).toBe(0)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 3, TOP, TITLE_LINES, list, 0, 40)).toBe(0)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 4, TOP, TITLE_LINES, list, 0, 40)).toBe(1)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 5, TOP, TITLE_LINES, list, 0, 40)).toBeNull()
  })
})
