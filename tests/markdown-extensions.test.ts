import { describe, expect, it } from 'vitest'
import { registerMarkdownBlock, registerMarkdownInline, registerPrismGrammar } from '../src/ui/message/md/extensions.ts'
import { renderMarkdown, clearMarkdownBlockCache } from '../src/ui/message/md/engine.ts'
import { highlightCodeBlock, clearHighlightCache } from '../src/ui/message/md/highlight.ts'

describe('markdown extension registry', () => {
  it('lets a plugin claim a block token type and restore the builtin on dispose', () => {
    const off = registerMarkdownBlock({
      type: 'hr',
      render: (_token, ctx) => [[{ text: 'CUSTOM-HR', style: { color: ctx.palette.plain.color } }]],
    })
    clearMarkdownBlockCache()
    const rendered = renderMarkdown('before\n\n---\n\nafter', 40)
    expect(rendered.lines.join('\n')).toContain('CUSTOM-HR')
    off()
    clearMarkdownBlockCache()
    const restored = renderMarkdown('before\n\n---\n\nafter', 40)
    expect(restored.lines.join('\n')).not.toContain('CUSTOM-HR')
    clearMarkdownBlockCache()
  })

  it('lets a plugin claim an inline token type', () => {
    const off = registerMarkdownInline({
      type: 'codespan',
      render: token => ({ text: `<${(token as { text: string }).text}>`, style: {} }),
    })
    clearMarkdownBlockCache()
    clearHighlightCache()
    const rendered = renderMarkdown('a `x` b', 40)
    expect(rendered.lines.join('')).toContain('<x>')
    off()
    clearMarkdownBlockCache()
    clearHighlightCache()
  })
})

describe('prism grammar registry', () => {
  it('registers a grammar that highlights fenced code', () => {
    const keyword = {
      pattern: /\b(fakekw)\b/,
    }
    const grammar = { keyword }
    const off = registerPrismGrammar({ id: 'fakelang', grammar })
    const segments = highlightCodeBlock('fakekw value', 'fakelang')
    expect(segments).not.toBeNull()
    expect(segments!.some(segment => segment.text === 'fakekw' && segment.style.color !== undefined)).toBe(true)
    off()
    clearHighlightCache()
  })
})
