import { describe, expect, it } from 'vitest'
import { palettes } from '../src/theme.ts'

const hex = (h: string): number[] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const dist = (a: string, b: string): number => {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b2 - b1))
}

describe('palette audit', () => {
  for (const mode of ['dark', 'light'] as const) {
    it(`${mode}: no near-duplicates (d<=6) across distinct keys`, () => {
      const pal = palettes[mode] as Record<string, string>
      const keys = Object.keys(pal)
      const dups: string[] = []
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const d = dist(pal[keys[i]!]!, pal[keys[j]!]!)
          if (d > 0 && d <= 6) dups.push(`${keys[i]} ${pal[keys[i]!]} ~ ${keys[j]} ${pal[keys[j]!]} (d=${d})`)
        }
      }
      expect(dups, dups.join('\n')).toEqual([])
    })
  }
  it('text gray ladder is tight (<=6 grays for text roles)', () => {
    const dark = palettes.dark as Record<string, string>
    const textGrays = new Set([
      dark.panelQuestionText, dark.modelText, dark.mdCodePlain, dark.codeOperator,
      dark.statusSeparator, dark.presetText, dark.cwdText, dark.statsText,
      dark.dialogHintText, dark.toolBodyText, dark.mdQuoteBar, dark.mdTaskTodo, dark.mdHr,
      dark.scrollThumbBackground,
    ])
    expect([...textGrays].length).toBeLessThanOrEqual(6)
  })
})
