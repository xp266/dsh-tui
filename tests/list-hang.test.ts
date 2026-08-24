import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/ui/message/md/index.ts'
import { textWidth } from '../src/core/text.ts'

function lines(md: string, width: number): string[] {
  return renderMarkdown(md, width).lines
}

describe('list hanging indent', () => {
  it('hangs continuation rows by the marker width for list items', () => {
    const md = '- create_goal/update_goal/get_goal: goal tools could create a trivial goal then complete it safely here'
    const result = lines(md, 60)
    expect(result.length).toBeGreaterThan(1)
    expect(result[0]!.startsWith('• create_goal')).toBe(true)
    for (const row of result.slice(1)) {
      expect(row.startsWith('  ')).toBe(true)
      expect(textWidth(row)).toBeLessThanOrEqual(60)
    }
  })

  it('keeps numbered markers aligned across wrapped rows', () => {
    const md = '12. a very long item body that certainly needs to wrap somewhere around the available width limit now'
    const result = lines(md, 50)
    expect(result[0]!.startsWith('12. ')).toBe(true)
    for (const row of result.slice(1)) {
      expect(row.startsWith(' '.repeat(4))).toBe(true)
    }
  })

  it('leaves non-list paragraphs unwrapped by the marker logic', () => {
    expect(lines('plain words only', 80)).toEqual(['plain words only'])
  })
})
