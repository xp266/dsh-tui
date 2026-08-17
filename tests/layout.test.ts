import { describe, expect, it } from 'vitest'
import type { Message } from '../src/state/messages.ts'
import { dragRect, rowCount, rowInfoAt, selectionText } from '../src/ui/layout.ts'

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

  it('extracts only the right column when the rectangle stays right of the gap', () => {
    expect(selectionText(twoColumn, WIDTH, { top: 1, bottom: 5, left: 11, right: 16 })).toBe('11111\n\n\n\n22222')
  })

  it('extracts only the left column when the rectangle stays left of the gap', () => {
    expect(selectionText(twoColumn, WIDTH, { top: 1, bottom: 5, left: 4, right: 7 })).toBe('111\n\n\n\n222')
  })

  it('does not include background rows in the result text', () => {
    expect(selectionText(twoColumn, WIDTH, { top: 0, bottom: 4, left: 4, right: 16 })).toBe('\n111    11111')
  })

  it('works against a mixed fixture list without throwing', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'user', content: '111    11111' },
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls -1\noutput empty', running: false, collapsed: true },
      { kind: 'bubble', id: 'c', role: 'assistant', content: '222    22222' },
    ]
    const text = selectionText(messages, WIDTH, { top: 0, bottom: rowCount(messages, WIDTH) - 1, left: 4, right: 60 })
    expect(text.length).toBeGreaterThan(10)
  })
})

describe('drag rectangle', () => {
  const anchor = { row: 5, x: 10 }

  it('expands when dragging down and right', () => {
    expect(dragRect(anchor, 8, 20)).toEqual({ top: 5, bottom: 8, left: 10, right: 21 })
  })

  it('shrinks back toward the anchor when dragging up', () => {
    expect(dragRect(anchor, 7, 15)).toEqual({ top: 5, bottom: 7, left: 10, right: 16 })
  })

  it('crosses the anchor and selects in the opposite direction', () => {
    expect(dragRect(anchor, 2, 4)).toEqual({ top: 2, bottom: 5, left: 4, right: 10 })
  })

  it('collapses to the anchor cell when returning to it', () => {
    expect(dragRect(anchor, 5, 10)).toEqual({ top: 5, bottom: 5, left: 10, right: 11 })
  })
})
