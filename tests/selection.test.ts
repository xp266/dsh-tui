import { describe, expect, it } from 'vitest'
import { toScreenSelection } from '../src/ui/selection.tsx'
import type { LineSelection } from '../src/ui/selection.tsx'
import { createScreenCapture } from '../src/terminal/screen.ts'

const MESSAGE_HEIGHT = 18

function messageSelection(overrides: Partial<LineSelection> = {}): LineSelection {
  return {
    anchorRow: 5,
    anchorCol: 2,
    focusRow: 8,
    focusCol: 10,
    anchorInMessage: true,
    focusInMessage: true,
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
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 14, focusRow: 17 })
  })

  it('clamps a selection partially scrolled out of the top', () => {
    const selection = messageSelection({ anchorRow: 3, focusRow: 9 })
    expect(toScreenSelection(selection, 8, MESSAGE_HEIGHT)).toEqual({ ...selection, anchorRow: 0, focusRow: 1 })
  })

  it('leaves non-message rows unmapped even when scrolled', () => {
    const selection = messageSelection({ anchorRow: 19, anchorCol: 2, focusRow: 21, focusCol: 4, anchorInMessage: false, focusInMessage: false })
    expect(toScreenSelection(selection, 7, MESSAGE_HEIGHT)).toEqual(selection)
  })

  it('returns null for no selection', () => {
    expect(toScreenSelection(null, 0, MESSAGE_HEIGHT)).toBeNull()
  })
})

describe('selection follows content when scrolled', () => {
  it('copies the anchored content from the scrolled screen', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Galpha beta\n\x1b[Ggamma delta\n\x1b[Gepsilon\x1b[K')
    const selection = messageSelection({ anchorRow: 2, anchorCol: 0, focusRow: 4, focusCol: 5 })
    const screen = toScreenSelection(selection, 2, MESSAGE_HEIGHT)
    expect(screen).toEqual({ ...selection, anchorRow: 0, focusRow: 2 })
    expect(capture.extractSelection(screen!)).toBe('alpha beta\ngamma delta\nepsil')
  })
})