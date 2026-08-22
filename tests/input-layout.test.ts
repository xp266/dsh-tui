import { describe, expect, it } from 'vitest'
import { inputLayout } from '../src/ui/input/input-bar.tsx'
import { textWidth } from '../src/utils/text.ts'

const textWidthOf = textWidth

function linesOf(count: number): string {
  return Array.from({ length: count }, (_, i) => `line-${i}`).join('\n')
}

describe('input layout reserve row', () => {
  it('caps the real rows and always reserves background below', () => {
    for (const count of [1, 2, 5, 7, 8, 9, 20]) {
      const value = linesOf(count)
      const layout = inputLayout(value, value.length, 80)
      expect(layout.realRows).toBe(Math.min(count, 7))
      expect(layout.barHeight).toBe(layout.realRows + 4)
      const relative = layout.cursorRow - layout.visibleStart
      expect(relative).toBeGreaterThanOrEqual(0)
      expect(relative).toBeLessThanOrEqual(layout.realRows - 1)
    }
  })

  it('scrolls the window once the real lines exceed the capacity', () => {
    const layout = inputLayout(linesOf(12), 1000, 80)
    expect(layout.realRows).toBe(7)
    expect(layout.visibleStart).toBe(5)
    expect(layout.lines[layout.visibleStart + 6]).toBe('line-11')
  })

  it('shows all lines without scrolling while under the capacity', () => {
    const layout = inputLayout(linesOf(3), 1000, 80)
    expect(layout.visibleStart).toBe(0)
    expect(layout.lines).toHaveLength(3)
    expect(layout.realRows).toBe(3)
  })

  it('keeps the caret exactly after the last character across every wrap boundary', () => {
    const width = 40
    for (const total of [width - 1, width, width + 1, width * 2, width * 2 + 3]) {
      const value = 'a'.repeat(total)
      const layout = inputLayout(value, value.length, width + 8)
      const currentLine = layout.lines[layout.cursorRow] ?? ''
      expect(layout.cursorRow).toBe(Math.ceil(total / width) - 1)
      expect(layout.cursorCol).toBe(textWidthOf(currentLine))
      expect(currentLine.length).toBeLessThanOrEqual(width)
    }
  })

  it('maps wide characters to their display columns on wrapped lines', () => {
    const width = 10
    const value = '\u4f60\u597d\u4e16\u754c\u4f60\u597d\u4e16\u754c\u4f60\u597d\u4e16\u754c'
    const layout = inputLayout(value, value.length, width + 8)
    const currentLine = layout.lines[layout.cursorRow] ?? ''
    expect(layout.cursorCol).toBe(textWidthOf(currentLine))
    expect(layout.cursorCol).toBeLessThanOrEqual(width)
  })
})
