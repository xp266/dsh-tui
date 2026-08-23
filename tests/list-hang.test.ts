import { describe, expect, it } from 'vitest'
import { layoutLineSegments } from '../src/ui/message/markdown.ts'
import { textWidth } from '../src/core/text.ts'

describe('list hanging indent', () => {
  it('hangs continuation rows by the marker width for single-segment list lines', () => {
    const line = '- create_goal/update_goal/get_goal: goal tools could create a trivial goal then complete it safely here'
    const rows = layoutLineSegments([{ text: line, style: {} }], 60)
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows.slice(1)) {
      const text = row.map(segment => segment.text).join('')
      expect(text.startsWith('  ')).toBe(true)
      expect(textWidth(text)).toBeLessThanOrEqual(60)
    }
    expect(rows[0]!.map(segment => segment.text).join('').startsWith('- create_goal')).toBe(true)
  })

  it('keeps numbered markers aligned across wrapped rows', () => {
    const line = '12. a very long item body that certainly needs to wrap somewhere around the available width limit now'
    const rows = layoutLineSegments([{ text: line, style: {} }], 50)
    expect(rows[0]!.map(segment => segment.text).join('').startsWith('12. ')).toBe(true)
    for (const row of rows.slice(1)) {
      expect(row.map(segment => segment.text).join('').startsWith(' '.repeat(4))).toBe(true)
    }
  })

  it('leaves non-list segments unwrapped by the marker logic', () => {
    const rows = layoutLineSegments([{ text: 'plain words only', style: {} }], 80)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.map(segment => segment.text).join('')).toBe('plain words only')
  })
})
