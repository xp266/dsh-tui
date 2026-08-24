import { describe, expect, it } from 'vitest'
import Prism from 'prismjs'
import { highlightCodeBlock, ensureGrammars } from '../../src/ui/message/md/highlight.ts'

function fullSegments(text: string): Array<{ text: string; color?: string }> {
  const out: Array<{ text: string; color?: string }> = []
  const plain = { color: 'plain' }
  const styles = { keyword: { color: 'kw' }, string: { color: 'str' }, comment: { color: 'com' }, number: { color: 'num' } }
  const walk = (tokens: (string | Prism.Token)[], style: { color?: string }): void => {
    for (const token of tokens) {
      if (typeof token === 'string') {
        out.push({ text: token, ...(!style.color ? {} : {}) })
        continue
      }
      const s = (styles as Record<string, { color?: string }>)[token.type] ?? style ?? plain
      if (typeof token.content === 'string') out.push({ text: token.content, ...(s === plain ? {} : {}) })
      else walk(token.content as (string | Prism.Token)[], s)
    }
  }
  walk(Prism.tokenize(text, Prism.languages.typescript!), plain)
  return out
}

function flat(segments: Array<{ text: string; color?: string }>): string {
  return segments.map(s => s.text).join('')
}

describe('incremental highlight parity', () => {
  it('incremental result covers identical text and ends equal to a full tokenize', () => {
    ensureGrammars()
    const lines = [
      'export function alpha(x: number): number {\n',
      "  const label = 'hello world'\n",
      '  // increment value\n',
      '  return x + 42\n',
      '}\n',
      '\n',
      'const beta = (a: string) => a.length\n',
    ]
    let text = ''
    let last: ReturnType<typeof highlightCodeBlock> | null = null
    for (const line of lines) {
      text += line
      last = highlightCodeBlock(text, 'ts', false)
      expect(flat(last!)).toBe(text)
    }
    const full = fullSegments(text)
    expect(flat(last!).length).toBe(flat(full).length)
    expect(flat(last!)).toBe(flat(full))
  })

  it('recovers after non-prefix rewrites', () => {
    ensureGrammars()
    const first = highlightCodeBlock('const a = 1\n', 'ts', false)
    expect(flat(first!)).toBe('const a = 1\n')
    const rewritten = highlightCodeBlock('const b = 22\n', 'ts', false)
    expect(flat(rewritten!)).toBe('const b = 22\n')
  })
})
