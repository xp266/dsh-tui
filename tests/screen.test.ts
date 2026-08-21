import { describe, expect, it } from 'vitest'
import { createScreenCapture } from '../src/terminal/screen.ts'

describe('screen capture', () => {
  it('extracts plain text frames', () => {
    const capture = createScreenCapture()
    const stream = capture.stream
    stream.write('\x1b[2K\x1b[1A\x1b[2K\x1b[Ghello world\nsecond line\x1b[K')
    expect(capture.extract({ top: 0, bottom: 1, left: 0, right: 12 })).toBe('hello world\nsecond line')
  })

  it('extracts ANSI-colored text without escape residue', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[G\x1b[31mred \x1b[32mgreen\x1b[0m end\x1b[K')
    expect(capture.extract({ top: 0, bottom: 0, left: 0, right: 20 })).toBe('red green end')
  })

  it('supports cell-range slicing including wide characters', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Gab中文cd\x1b[K')
    expect(capture.extract({ top: 0, bottom: 0, left: 2, right: 6 })).toBe('中文')
  })

  it('keeps capture columns aligned with the terminal after wide characters', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[G你好\x1b[13G/home/xp\x1b[K')
    const selection = { anchorRow: 0, anchorCol: 12, focusRow: 0, focusCol: 20, inMessage: true }
    expect(capture.extractSelection(selection)).toBe('/home/xp')
  })

  it('copies full right-aligned paths on rows with CJK titles', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[G列出你的全部工具的名称\x1b[34G/home/xp266/github/deepseek-harness\x1b[K')
    const selection = { anchorRow: 0, anchorCol: 0, focusRow: 0, focusCol: 80, inMessage: true }
    expect(capture.extractSelection(selection)).toBe(
      '列出你的全部工具的名称' + ' '.repeat(11) + '/home/xp266/github/deepseek-harness',
    )
  })

  it('applies cursor positioning sequences', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Gline one\nline two\x1b[K')
    capture.stream.write('\x1b[1A\x1b[5GX\x1b[K')
    const line = capture.extract({ top: 0, bottom: 0, left: 0, right: 8 })
    expect(line).toBe('lineX')
  })

  it('handles partial writes split across chunks', () => {
    const capture = createScreenCapture()
    const frame = '\x1b[2K\x1b[1A\x1b[2K\x1b[Gsplit chunk text\x1b[K'
    for (let i = 0; i < frame.length; i += 3) {
      capture.stream.write(frame.slice(i, i + 3))
    }
    expect(capture.extract({ top: 0, bottom: 1, left: 0, right: 20 })).toBe('split chunk text')
  })

  it('ignores OSC sequences', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b]52;cAB=\x07\x1b[Gafter osc\x1b[K')
    expect(capture.extract({ top: 0, bottom: 0, left: 0, right: 20 })).toBe('after osc')
  })

  it('detects lines with text for anchoring', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Gline one\n\x1b[G\n\x1b[Gline three\x1b[K')
    expect(capture.rowHasText(0)).toBe(true)
    expect(capture.rowHasText(1)).toBe(false)
    expect(capture.rowHasText(2)).toBe(true)
    expect(capture.rowHasText(9)).toBe(false)
  })

  it('extracts line-based selections across rows', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Galpha beta\n\x1b[Ggamma delta\n\x1b[Gepsilon\x1b[K')
    const selection = { anchorRow: 0, anchorCol: 2, focusRow: 2, focusCol: 4, inMessage: true }
    expect(capture.extractSelection(selection)).toBe('pha beta\ngamma delta\nepsi')
  })

  it('extracts a single-line column range', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Gabcdef\x1b[K')
    expect(capture.extractSelection({ anchorRow: 0, anchorCol: 1, focusRow: 0, focusCol: 5, inMessage: true })).toBe('bcde')
  })

  it('extracts upward selections with the anchor line first', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[Gfirst line\n\x1b[Gsecond line\x1b[K')
    const selection = { anchorRow: 1, anchorCol: 3, focusRow: 0, focusCol: 2, inMessage: true }
    expect(capture.extractSelection(selection)).toBe('rst line\nsec')
  })

  it('treats half-block rows as non-anchorable background', () => {
    const capture = createScreenCapture()
    capture.stream.write('\x1b[G▄▄▄▄▄\n\x1b[Greal text\x1b[K')
    expect(capture.rowHasText(0)).toBe(false)
    expect(capture.rowHasText(1)).toBe(true)
    const selection = { anchorRow: 0, anchorCol: 0, focusRow: 1, focusCol: 9, inMessage: true }
    expect(capture.extractSelection(selection)).toBe('\nreal text')
  })
})