import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { colToCharIndex, lineBreaks, textWidth, truncate, wrapLines } from '../src/core/text.ts'
import { tokenizeMarkdown, wrapSegments } from '../src/ui/message/markdown.ts'

const EXAMPLE =
  '| 1️⃣ | rm /home/xp266/ox-alpha-permission-test.txt（工作区外删除） | ❌ 被拒：Read-only file system + [sandbox: file access denied under workspace-write mode]，并附升级提示 |'

describe('grapheme-aware widths', () => {
  it('measures multi-codepoint clusters like the renderer does', () => {
    expect(textWidth('1️⃣')).toBe(stringWidth('1️⃣'))
    expect(textWidth('1️⃣')).toBe(2)
    expect(textWidth(EXAMPLE)).toBe(stringWidth(EXAMPLE))
    expect(textWidth('❤️')).toBe(2)
  })

  it('keeps every wrapped row within the width for the reported example', () => {
    for (const width of [20, 40, 60, 80, 96, 120]) {
      const rows = wrapLines(EXAMPLE, width)
      expect(rows.length).toBeGreaterThan(1)
      for (const row of rows) {
        expect(stringWidth(row), `width ${width}`).toBeLessThanOrEqual(width)
      }
    }
  })

  it('does not split keycap sequences at boundaries', () => {
    expect(wrapLines('a1️⃣a1️⃣', 4)).toEqual(['a1️⃣a', '1️⃣'])
  })

  it('tracks char offsets across keycap wraps', () => {
    expect(lineBreaks('a1️⃣a1️⃣', 4)).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 8 },
    ])
  })

  it('maps columns back to cluster boundaries', () => {
    const line = 'x1️⃣y'
    expect(colToCharIndex(line, 0)).toBe(0)
    expect(colToCharIndex(line, 1)).toBe(1)
    expect(colToCharIndex(line, 2)).toBe(4)
    expect(colToCharIndex(line, 3)).toBe(4)
    expect(colToCharIndex(line, 99)).toBe(line.length)
  })

  it('truncates without splitting clusters', () => {
    expect(truncate('a1️⃣b', 3)).toBe('a1️⃣')
    expect(truncate('a1️⃣b', 2)).toBe('a')
  })
})

describe('segment wrapping parity', () => {
  it('produces the same rows as plain wrapping for the reported example', () => {
    for (const width of [20, 40, 80, 96]) {
      const rows = wrapSegments(tokenizeMarkdown(EXAMPLE), width)
      const plain = wrapLines(EXAMPLE, width)
      expect(rows.map(row => row.map(segment => segment.text).join(''))).toEqual(plain)
    }
  })

  it('never emits a row wider than the budget', () => {
    const content = 'A'.repeat(90) + '1️⃣' + 'END-TOKEN'
    for (const width of [30, 60, 92]) {
      for (const row of wrapSegments(tokenizeMarkdown(content), width)) {
        expect(stringWidth(row.map(segment => segment.text).join('')), `width ${width}`).toBeLessThanOrEqual(width)
      }
    }
    expect(wrapSegments(tokenizeMarkdown(content), 92).map(row => row.map(segment => segment.text).join(''))).toEqual([
      'A'.repeat(90) + '1️⃣',
      'END-TOKEN',
    ])
  })
})
