import { describe, expect, it } from 'vitest'
import { inputLayout } from '../src/ui/input/input-bar.tsx'

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
})
