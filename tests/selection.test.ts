import { describe, expect, it } from 'vitest'
import { clampFocusRow, toScreenSelection } from '../src/model/selection.ts'
import type { LineSelection } from '../src/model/selection.ts'
import { hintRegion } from '../src/ui/hooks/use-mouse-selection.ts'

const MESSAGE_HEIGHT = 18

function messageSelection(overrides: Partial<LineSelection> = {}): LineSelection {
  return {
    anchorRow: 5,
    anchorCol: 2,
    focusRow: 8,
    focusCol: 10,
    inMessage: true,
    ...overrides,
  }
}

describe('toScreenSelection', () => {
  it('maps message rows with scrollTop', () => {
    const selection = messageSelection()
    expect(toScreenSelection(selection, 0, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 5, focusRow: 8 })
    expect(toScreenSelection(selection, 3, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 2, focusRow: 5 })
  })

  it('hides the selection when scrolled above the viewport', () => {
    const selection = messageSelection({ anchorRow: 1, focusRow: 3 })
    expect(toScreenSelection(selection, 5, MESSAGE_HEIGHT)).toBeNull()
  })

  it('hides the selection when scrolled below the message area', () => {
    const selection = messageSelection({ anchorRow: 19, focusRow: 21 })
    expect(toScreenSelection(selection, 0, MESSAGE_HEIGHT)).toBeNull()
    const high = messageSelection({ anchorRow: 30, focusRow: 32 })
    expect(toScreenSelection(high, 12, MESSAGE_HEIGHT)).toBeNull()
  })

  it('keeps the selection visible while the content stays in the message area', () => {
    const selection = messageSelection({ anchorRow: 19, focusRow: 21 })
    expect(toScreenSelection(selection, 6, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 13, focusRow: 15 })
  })

  it('clamps a selection partially scrolled out of the bottom', () => {
    const selection = messageSelection({ anchorRow: 22, focusRow: 27 })
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 14, focusRow: 17, focusCol: Infinity })
  })

  it('clamps a selection partially scrolled out of the top', () => {
    const selection = messageSelection({ anchorRow: 3, focusRow: 9 })
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 0, focusRow: 1, anchorCol: 0 })
  })

  it('snaps the clamped top endpoint of an upward selection to the row start', () => {
    const selection = messageSelection({ anchorRow: 9, anchorCol: 7, focusRow: 2, focusCol: 3 })
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 1, focusRow: 0, focusCol: 0 })
  })

  it('snaps the clamped bottom endpoint of an upward selection to the row end', () => {
    const selection = messageSelection({ anchorRow: 27, anchorCol: 7, focusRow: 22, focusCol: 3 })
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 17, focusRow: 14, anchorCol: Infinity })
  })

  it('keeps columns unchanged while both endpoints stay visible', () => {
    const selection = messageSelection({ anchorRow: 12, anchorCol: 7, focusRow: 15, focusCol: 3 })
    expect(toScreenSelection(selection, 6, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 6, focusRow: 9 })
  })

  it('leaves non-message rows unmapped even when scrolled', () => {
    const selection = messageSelection({ anchorRow: 19, anchorCol: 2, focusRow: 21, focusCol: 4, inMessage: false })
    expect(toScreenSelection(selection, 7, MESSAGE_HEIGHT)).toEqual(selection)
  })

  it('returns null for no selection', () => {
    expect(toScreenSelection(null, 0, MESSAGE_HEIGHT)).toBeNull()
  })
})

describe('clampFocusRow', () => {
  it('keeps a message-anchored focus inside the visible message rows', () => {
    expect(clampFocusRow(true, 3, 10, MESSAGE_HEIGHT, 24, false)).toBe(13)
    expect(clampFocusRow(true, 17, 10, MESSAGE_HEIGHT, 24, false)).toBe(27)
    expect(clampFocusRow(true, 30, 10, MESSAGE_HEIGHT, 24, false)).toBe(27)
  })

  it('keeps a chrome-anchored focus below the message area', () => {
    expect(clampFocusRow(false, 30, 0, MESSAGE_HEIGHT, 24, false)).toBe(30)
    expect(clampFocusRow(false, 5, 0, MESSAGE_HEIGHT, 24, false)).toBe(MESSAGE_HEIGHT)
  })

  it('keeps a dialog-anchored focus anywhere on screen', () => {
    expect(clampFocusRow(false, 5, 0, MESSAGE_HEIGHT, 24, true)).toBe(5)
    expect(clampFocusRow(false, 23, 0, MESSAGE_HEIGHT, 24, true)).toBe(23)
  })
})
describe('hintRegion', () => {
  const hint = { commands: [1, 2, 3].map(i => ({ command: `/c${i}`, description: 'd' })), selectedIndex: 0 }

  it('spans the rows directly above the input bar', () => {
    expect(hintRegion(24, hint, false)).toEqual({ top: 15, bottom: 17 })
  })

  it('returns null while a dialog is open or no hints are shown', () => {
    expect(hintRegion(24, hint, true)).toBeNull()
    expect(hintRegion(24, null, false)).toBeNull()
  })

  it('clamps the top at the screen edge for tiny terminals', () => {
    expect(hintRegion(9, { commands: Array.from({ length: 6 }, (_, i) => ({ command: `/c${i}`, description: 'd' })), selectedIndex: 0 }, false)).toEqual({ top: 0, bottom: 2 })
  })
})
