import { describe, expect, it } from 'vitest'
import { hitRowIndex } from '../src/ui/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog.tsx'

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

  it('handles multi-line rows', () => {
    const list: DialogRow[] = [
      rows(1)[0],
      { items: [{ type: 'select', label: 'S', value: 'a', options: ['a', 'b'], onChange: () => {} }] },
    ]
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 1, TOP, TITLE_LINES, list)).toBe(1)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 3, TOP, TITLE_LINES, list)).toBe(1)
    expect(hitRowIndex(TOP + 1 + TITLE_LINES + 4, TOP, TITLE_LINES, list)).toBeNull()
  })
})
