import { describe, expect, it } from 'vitest'
import type { Message } from '../src/model/message.ts'
import { buildRowIndex, fitLabel, rowCount, rowInfoAt, rowIndexFor, selectionText } from '../src/ui/message/layout.ts'
import type { LineSelection } from '../src/model/selection.ts'
import { textWidth } from '../src/core/text.ts'
import { COLORS } from '../src/theme.ts'
import { createMdPalette } from '../src/ui/message/md/palette.ts'
import type { MarkStyle, Segment } from '../src/core/segments.ts'

const light = createMdPalette(false)
const think = createMdPalette(true)

function seg(text: string, style: MarkStyle = light.plain): Segment {
  return { text, style }
}

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

  it('attaches styled segments to assistant bubble rows', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'assistant', content: '**bold** text' },
    ]
    const row = rowInfoAt(messages, WIDTH, 0)
    expect(row).toMatchObject({ kind: 'text', text: 'bold text', colStart: 4, selectable: true })
    expect(row?.segments).toEqual([seg('bold', light.bold), seg(' text')])
    expect(row?.segKey).toBeDefined()
    expect(rowInfoAt(messages, WIDTH, 1)).toMatchObject({ kind: 'blank' })
    expect(rowCount(messages, WIDTH)).toBe(2)
  })

  it('keeps plain assistant rows segment-free compatible', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'assistant', content: 'plain text' },
    ]
    const row = rowInfoAt(messages, WIDTH, 0)
    expect(row).toMatchObject({ kind: 'text', text: 'plain text' })
    expect(row?.segments).toEqual([seg('plain text')])
  })

  it('leaves user and tool rows without segments', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'u', role: 'user', content: '**not markdown**' },
      { kind: 'collapsible', id: 't', label: 'Bash', body: '**not markdown**', running: false, collapsed: false },
    ]
    expect(rowInfoAt(messages, WIDTH, 1)?.segments).toBeUndefined()
    expect(rowInfoAt(messages, WIDTH, 5)?.segments).toBeUndefined()
  })

  it('attaches styled segments to thinking rows with the dimmed palette', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 't', label: 'Thinking', body: 'use `code` here', running: true, collapsed: false, thinking: true },
    ]
    const row = rowInfoAt(messages, WIDTH, 2)
    expect(row).toMatchObject({ kind: 'text', text: 'use code here', colStart: 4, muted: true, selectable: true })
    expect(row?.segments).toEqual([
      seg('use ', think.plain),
      seg('code', think.inlineCode),
      seg(' here', think.plain),
    ])
    expect(row?.segKey).toBeDefined()
  })
})

describe('fitLabel', () => {
  it('keeps a label that fits the row', () => {
    expect(fitLabel('bash[command=ls -la src]', 80)).toBe('bash[command=ls -la src]')
  })

  it('truncates the bracket content to the available width with an ellipsis', () => {
    const label = `bash[command=ls -la src, description=List files in the working directory]`
    expect(fitLabel(label, 30)).toBe('bash[command=ls -l...]')
  })

  it('fits shorter labels in narrower windows', () => {
    const label = `read[src/main.py, offset=1]`
    expect(fitLabel(label, 30)).toBe('read[src/main.py, ...]')
    expect(fitLabel(label, 22)).toBe('read[src/m...]')
  })

  it('truncates labels without brackets as plain text', () => {
    expect(fitLabel('a'.repeat(50), 30)).toBe(`${'a'.repeat(19)}...`)
  })

  it('fits labels into the row header through the row index', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: `bash[command=${'x'.repeat(200)}]`, body: '', running: false, collapsed: true },
    ]
    const header = rowInfoAt(messages, 40, 0)
    expect(header).toMatchObject({ kind: 'header', label: `bash[command=${'x'.repeat(15)}...]` })
  })

  it('never renders a fitted label wider than the available row', () => {
    const label = `bash[command=${'x'.repeat(200)}, path=src/main.py]`
    for (let width = 20; width <= 160; width += 7) {
      const fitted = fitLabel(label, width)
      expect(textWidth(fitted)).toBeLessThanOrEqual(Math.max(1, width - 8))
    }
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
    expect(selectionText(twoColumn, WIDTH, msgSel(1, 4, 5, 16))).toBe('111    11111\n\n222    22222')
  })

  it('slices the focus row by column range', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(1, 4, 5, 7))).toBe('111    11111\n\n222')
  })

  it('does not include background rows in the result text', () => {
    expect(selectionText(twoColumn, WIDTH, msgSel(0, 4, 4, 16))).toBe('111    11111')
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
    expect(selectionText(messages, WIDTH, selection)).toBe('user line\n\nassistant line\n\nthird line')
  })

  it('includes header rows in the extraction', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls', running: false, collapsed: false },
    ]
    expect(selectionText(messages, WIDTH, msgSel(0, 2, 2, 5))).toBe('↓ Bash\n\nl')
  })

  it('excludes the header symbol when the envelope stays inside the label columns', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: 'ls', running: false, collapsed: false },
    ]
    expect(selectionText(messages, WIDTH, msgSel(0, 6, 2, 8))).toBe('sh\n\nls')
  })

  it('keeps short flowing lines outside the horizontal envelope', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'assistant', content: 'first long line aaaaaaaa\nshort\nsecond long line bbbbbbbb' },
    ]
    expect(selectionText(messages, WIDTH, msgSel(0, 10, 5, 12))).toBe(
      'long line aaaaaaaa\nshort\nsecond long line bbbbbbbb',
    )
  })

  it('keeps the header symbol when the envelope crosses into it', () => {
    const messages: Message[] = [
      { kind: 'collapsible', id: 'b', label: 'Bash', body: '', running: false, collapsed: true },
    ]
    expect(selectionText(messages, WIDTH, msgSel(0, 1, 1, 10))).toBe(' - Bash')
  })

  it('caches the row index per messages and width and rebuilds on change', () => {
    const messages: Message[] = [
      { kind: 'bubble', id: 'a', role: 'user', content: 'hello' },
    ]
    const first = rowIndexFor(messages, WIDTH)
    expect(rowIndexFor(messages, WIDTH)).toBe(first)
    expect(rowCount(messages, WIDTH)).toBe(first.total)
    const next: Message[] = [...messages, { kind: 'bubble', id: 'b', role: 'assistant', content: 'hi' }]
    expect(rowIndexFor(next, WIDTH)).not.toBe(first)
    expect(rowIndexFor(messages, 40)).not.toBe(first)
    expect(rowIndexFor(messages, WIDTH).total).toBe(first.total)
  })
})

describe('compaction bubble layout', () => {
  const running: Message = {
    kind: 'compaction',
    id: 'c1',
    compactionId: 'cp1',
    running: true,
    summary: '',
  }

  it('shows the tool bubble shell while running', () => {
    expect(rowCount([running], WIDTH)).toBe(4)
    expect(rowInfoAt([running], WIDTH, 0)).toMatchObject({ kind: 'pad', background: true })
    const header = rowInfoAt([running], WIDTH, 1)
    expect(header).toMatchObject({ kind: 'text', text: 'Compact', colStart: 4, background: true })
    expect(header?.segments?.[0]).toMatchObject({ style: { color: COLORS.sectionHeader, bold: true } })
    expect(header?.spinner ?? false).toBe(false)
    expect(rowInfoAt([running], WIDTH, 2)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt([running], WIDTH, 3)).toMatchObject({ kind: 'blank' })
  })

  it('renders the summary as markdown rows when done', () => {
    const done: Message = {
      kind: 'compaction',
      id: 'c2',
      compactionId: 'cp2',
      running: false,
      summary: 'plain **kept** tail',
    }
    const total = rowCount([done], WIDTH)
    expect(total).toBe(6)
    expect(rowInfoAt([done], WIDTH, 0)).toMatchObject({ kind: 'pad', background: true })
    const header = rowInfoAt([done], WIDTH, 1)
    expect(header).toMatchObject({ kind: 'text', text: 'Compact', background: true })
    expect(header?.segments?.[0]?.style).toMatchObject({ color: COLORS.sectionHeader, bold: true })
    expect(header?.spinner).toBeUndefined()
    expect(rowInfoAt([done], WIDTH, 2)).toMatchObject({ kind: 'pad' })
    const bodyRow = rowInfoAt([done], WIDTH, 3)
    expect(bodyRow).toMatchObject({ kind: 'text', colStart: 4, selectable: true, background: true })
    expect(bodyRow?.text).toContain('kept')
    expect(bodyRow?.segments?.some(segment => segment.style.bold === true)).toBe(true)
    expect(rowInfoAt([done], WIDTH, total - 2)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt([done], WIDTH, total - 1)).toMatchObject({ kind: 'blank' })
  })

  it('renders an end error as the body in the error color', () => {
    const failed: Message = {
      kind: 'compaction',
      id: 'c3',
      compactionId: 'cp3',
      running: false,
      summary: '',
      error: 'summary diverged',
    }
    expect(rowCount([failed], WIDTH)).toBe(6)
    const header = rowInfoAt([failed], WIDTH, 1)
    expect(header?.kind).toBe('text')
    const errorBody = rowInfoAt([failed], WIDTH, 3)
    expect(errorBody?.text).toBe('error: summary diverged')
    expect(errorBody?.segments?.[0]?.style).toMatchObject({ color: COLORS.errorText })
  })

  it('never emits control characters into rendered summary rows', () => {
    const done: Message = {
      kind: 'compaction',
      id: 'c9',
      compactionId: 'cp9',
      running: false,
      summary: 'kept **the** plan\n- second bullet wraps across the width boundary here',
    }
    const index = buildRowIndex([done], WIDTH)
    for (let row = 0; row < index.total; row++) {
      const info = index.rowAt(row)
      if (info === null || info.kind !== 'text') continue
      expect(info.text.includes('\u0000')).toBe(false)
      for (const segment of info.segments ?? []) {
        expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(segment.text)).toBe(false)
      }
    }
  })

  it('separates a tool card error line from the body with a blank row', () => {
    const failed: Message = {
      kind: 'tool-card',
      id: 't1',
      tool: 'ask_user_question',
      label: 'ask_user_question',
      argsBody: '1. This is the second question test: which option do you want?\n   End the test',
      error: 'error: ToolOutcomeUnknownError',
      running: false,
    }
    const index = buildRowIndex([failed], WIDTH)
    const rows: string[] = []
    for (let row = 0; row < index.total; row++) {
      const info = index.rowAt(row)
      rows.push(info?.kind === 'text' ? info.text : '')
    }
    const errorAt = rows.findIndex(text => text.includes('ToolOutcomeUnknownError'))
    expect(errorAt).toBeGreaterThan(0)
    expect(rows[errorAt - 1]).toBe('')
    const lastBody = rows[errorAt - 2]
    expect(lastBody).not.toBe('')
  })
})