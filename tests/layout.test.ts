import { describe, expect, it } from 'vitest'
import type { Message } from '../src/model/message.ts'
import { rowCount, rowInfoAt, selectionText } from '../src/ui/message/layout.ts'
import type { LineSelection } from '../src/model/selection.ts'

const WIDTH = 80

describe('row layout', () => {
  it('maps bubble rows to text rows starting at column 4', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'user', content: 'hello' },
    ]
    const top = rowInfoAt(messages, WIDTH, 0)
    expect(top).toMatchObject({ kind: 'pad', selectable: false })
    const text = rowInfoAt(messages, WIDTH, 1)
    expect(text).toMatchObject({ kind: 'text', text: 'hello', colStart: 4, selectable: true })
    expect(rowInfoAt(messages, WIDTH, 2)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt(messages, WIDTH, 3)).toMatchObject({ kind: 'blank' })
    expect(rowInfoAt(messages, WIDTH, 4)).toBeNull()
    expect(rowCount(messages, WIDTH)).toBe(4)
  })

  it('marks collapsible headers as clickable and expanded content as selectable', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls\noutput empty', running: false, collapsed: false },
    ]
    expect(rowInfoAt(messages, WIDTH, 0)).toMatchObject({ kind: 'header', clickable: true, selectable: false })
    expect(rowInfoAt(messages, WIDTH, 1)).toMatchObject({ kind: 'blank' })
    expect(rowInfoAt(messages, WIDTH, 2)).toMatchObject({ kind: 'text', text: 'ls', colStart: 4, selectable: true })
    expect(rowInfoAt(messages, WIDTH, 3)).toMatchObject({ kind: 'text', selectable: true })
    expect(rowInfoAt(messages, WIDTH, 4)).toMatchObject({ kind: 'blank' })
    expect(rowCount(messages, WIDTH)).toBe(5)
  })

  it('keeps a collapsed collapsible at two rows', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls', running: false, collapsed: true },
    ]
    expect(rowCount(messages, WIDTH)).toBe(2)
    expect(rowInfoAt(messages, WIDTH, 1)).toMatchObject({ kind: 'blank' })
  })
})

describe('selection text extraction', () => {
  const twoColumn: Message[] = [
    { kind: 'bubble', id: 'a', role: 'user', content: '111    11111' },
    { kind: 'bubble', id: 'b', role: 'user', content: '222    22222' },
  ]

  function msgSel(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number): LineSelection {
    return { anchorRow, anchorCol, focusRow, focusCol, inMessage: true }
  }

  it('extracts full middle rows between the anchor rows', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(1, 4, 5, 16))).toBe('111    11111\n\n\n\n222    22222')
  })

  it('slices the focus row by column range', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(1, 4, 5, 7))).toBe('111    11111\n\n\n\n222')
  })

  it('does not include background rows in the result text', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(0, 4, 4, 16))).toBe('\n111    11111')
  })

  it('extracts a single-line column range', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(1, 4, 1, 9))).toBe('111')
  })

  it('extracts the full anchored content regardless of scroll position', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'user', content: 'user line' },
      { kind: 'bubble', id: 'b', role: 'assistant', content: 'assistant line' },
      { kind: 'bubble', id: 'c', role: 'user', content: 'third line' },
    ]
    const selection = msgSel(1, 4, 9, 14)
    expect(selectionText(messages, WIDTH, selection)).toBe('user line\n\n\n\nassistant line\n\n\n\nthird line')
  })

  it('includes header rows in the extraction', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls', running: false, collapsed: false },
    ]
    expect(selectionText(messages, WIDTH, msgSel(0, 2, 2, 5))).toBe('  ↓ Bash\n\nl')
  })
})