import { describe, expect, it } from 'vitest'
import { mdStyles, createMarkdownTokenizer, createThinkingTokenizer, createSegmentWrapper, layoutLineSegments, tokenizeMarkdown, tokenizeThinking, wrapSegments } from '../src/ui/message/markdown.ts'
import type { SegmentWrapper } from '../src/ui/message/markdown.ts'
import type { MarkStyle, Segment } from '../src/ui/message/markdown.ts'
import { codeStyles, codeStylesDark, highlightCode } from '../src/ui/message/highlight.ts'

function seg(text: string, style: MarkStyle = mdStyles.plain): Segment {
  return { text, style }
}

describe('tokenizeMarkdown', () => {
  it('renders bold with the orange bold style and strips the markers', () => {
    expect(tokenizeMarkdown('**bold**')).toEqual([seg('bold', mdStyles.bold)])
  })

  it('keeps text around inline markers as plain', () => {
    expect(tokenizeMarkdown('a**b**c')).toEqual([seg('a'), seg('b', mdStyles.bold), seg('c')])
  })

  it('renders inline code green and strips the backticks', () => {
    expect(tokenizeMarkdown('use `code` here')).toEqual([seg('use '), seg('code', mdStyles.inlineCode), seg(' here')])
  })

  it('applies bold style to the remainder when unclosed (streaming)', () => {
    expect(tokenizeMarkdown('**bold')).toEqual([seg('bold', mdStyles.bold)])
  })

  it('applies inline code style to the remainder when unclosed (streaming)', () => {
    expect(tokenizeMarkdown('`code')).toEqual([seg('code', mdStyles.inlineCode)])
  })

  it('styles heading text by level and strips the hashes', () => {
    expect(tokenizeMarkdown('# Title')).toEqual([seg('Title', mdStyles.h1)])
    expect(tokenizeMarkdown('## Title')).toEqual([seg('Title', mdStyles.h2)])
    expect(tokenizeMarkdown('### Title')).toEqual([seg('Title', mdStyles.h3)])
    expect(tokenizeMarkdown('#### Title')).toEqual([seg('Title', mdStyles.h3)])
    expect(tokenizeMarkdown('###### Title')).toEqual([seg('Title', mdStyles.h3)])
  })

  it('colors list markers light blue and keeps the item text plain', () => {
    expect(tokenizeMarkdown('- item')).toEqual([seg('- ', mdStyles.list), seg('item')])
    expect(tokenizeMarkdown('* item')).toEqual([seg('* ', mdStyles.list), seg('item')])
    expect(tokenizeMarkdown('+ item')).toEqual([seg('+ ', mdStyles.list), seg('item')])
    expect(tokenizeMarkdown('1. item')).toEqual([seg('1. ', mdStyles.list), seg('item')])
    expect(tokenizeMarkdown('12. item')).toEqual([seg('12. ', mdStyles.list), seg('item')])
  })

  it('renders inline markdown inside list items', () => {
    expect(tokenizeMarkdown('1. **bold** text')).toEqual([
      seg('1. ', mdStyles.list),
      seg('bold', mdStyles.bold),
      seg(' text'),
    ])
    expect(tokenizeMarkdown('   - `code` item')).toEqual([
      seg('   - ', mdStyles.list),
      seg('code', mdStyles.inlineCode),
      seg(' item'),
    ])
  })

  it('renders inline markdown inside headings with the heading color', () => {
    expect(tokenizeMarkdown('## **Title**')).toEqual([
      { text: 'Title', style: { color: mdStyles.h2.color, bold: true } },
    ])
    expect(tokenizeMarkdown('# **Bold** and `code`')).toEqual([
      { text: 'Bold', style: { color: mdStyles.h1.color, bold: true } },
      { text: ' and ', style: { color: mdStyles.h1.color, bold: true } },
      { text: 'code', style: { color: mdStyles.h1.color, bold: true, italic: undefined } },
    ])
  })

  it('does not treat plain digits or dashes as list markers', () => {
    expect(tokenizeMarkdown('1.5 version')).toEqual([seg('1.5 version')])
    expect(tokenizeMarkdown('-x')).toEqual([seg('-x')])
  })

  it('styles code blocks with the language color and strips the fences', () => {
    const md = '```python\nprint(1)\n```\nafter'
    expect(tokenizeMarkdown(md)).toEqual([
      seg('print', codeStyles.keyword),
      seg('(', codeStyles.punctuation),
      seg('1', codeStyles.number),
      seg(')', codeStyles.punctuation),
      seg('\n'),
      seg('after'),
    ])
  })

  it('styles code blocks without a language in light blue', () => {
    expect(tokenizeMarkdown('```\ncode\n```')).toEqual([seg('code', mdStyles.codeNoLang)])
  })

  it('continues the code style to the end when the fence is unclosed (streaming)', () => {
    expect(tokenizeMarkdown('```js\nconst x = 1')).toEqual([
      seg('const', codeStyles.keyword),
      seg(' x ', codeStyles.punctuation),
      seg('=', codeStyles.punctuation),
      seg(' ', codeStyles.punctuation),
      seg('1', codeStyles.number),
    ])
  })

  it('does not parse inline markers inside code blocks', () => {
    expect(tokenizeMarkdown('```\n**bold** `code`\n```')).toEqual([seg('**bold** `code`', mdStyles.codeNoLang)])
  })

  it('preserves newline structure between lines', () => {
    expect(tokenizeMarkdown('a\n\nb')).toEqual([seg('a'), seg('\n'), seg('\n'), seg('b')])
  })

  it('does not emit a trailing newline segment at the end', () => {
    expect(tokenizeMarkdown('a\nb')).toEqual([seg('a'), seg('\n'), seg('b')])
  })
})

describe('tokenizeThinking', () => {
  it('keeps backticks and colors inline code content dark green', () => {
    expect(tokenizeThinking('use `code` here')).toEqual([
      seg('use '),
      seg('`'),
      seg('code', mdStyles.thinkInlineCode),
      seg('`'),
      seg(' here'),
    ])
  })

  it('keeps quotes and colors the quoted content brown', () => {
    expect(tokenizeThinking('say "hi" now')).toEqual([
      seg('say '),
      seg('"'),
      seg('hi', mdStyles.thinkQuote),
      seg('"'),
      seg(' now'),
    ])
  })

  it('applies styles to the remainder when unclosed (streaming)', () => {
    expect(tokenizeThinking('`code')).toEqual([seg('`'), seg('code', mdStyles.thinkInlineCode)])
    expect(tokenizeThinking('"hi')).toEqual([seg('"'), seg('hi', mdStyles.thinkQuote)])
  })

  it('keeps code fences and uses the darkened palette', () => {
    const md = '```python\nprint(1)\n```'
    expect(tokenizeThinking(md)).toEqual([
      seg('```python'),
      seg('\n'),
      seg('print', codeStylesDark.keyword),
      seg('(', codeStylesDark.punctuation),
      seg('1', codeStylesDark.number),
      seg(')', codeStylesDark.punctuation),
      seg('\n'),
      seg('```'),
    ])
  })

  it('colors no-language code blocks in the darkened light blue', () => {
    expect(tokenizeThinking('```\n`x` "y"\n```')).toEqual([
      seg('```'),
      seg('\n'),
      seg('`x` "y"', mdStyles.codeNoLangDark),
      seg('\n'),
      seg('```'),
    ])
  })

  it('keeps the fence and dark palette when the block is unclosed (streaming)', () => {
    expect(tokenizeThinking('```js\nconst x = 1')).toEqual([
      seg('```js'),
      seg('\n'),
      seg('const', codeStylesDark.keyword),
      seg(' x ', codeStylesDark.punctuation),
      seg('=', codeStylesDark.punctuation),
      seg(' ', codeStylesDark.punctuation),
      seg('1', codeStylesDark.number),
    ])
  })

  it('does not apply inline rules inside code blocks', () => {
    expect(tokenizeThinking('```js\n"quoted" `tick`\n```')).toEqual([
      seg('```js'),
      seg('\n'),
      seg('"quoted"', codeStylesDark.string),
      seg(' ', codeStylesDark.punctuation),
      seg('`', codeStylesDark.punctuation),
      seg('tick', codeStylesDark.string),
      seg('`', codeStylesDark.punctuation),
      seg('\n'),
      seg('```'),
    ])
  })

  it('preserves newline structure and trailing lines', () => {
    expect(tokenizeThinking('a\n\nb')).toEqual([seg('a'), seg('\n'), seg('\n'), seg('b')])
  })
})

describe('highlightCode', () => {
  it('maps keywords, numbers and operators to the palette', () => {
    expect(highlightCode('const x = 1', 'js')).toEqual([
      seg('const', codeStyles.keyword),
      seg(' x ', codeStyles.punctuation),
      seg('=', codeStyles.punctuation),
      seg(' ', codeStyles.punctuation),
      seg('1', codeStyles.number),
    ])
  })

  it('maps function names and comments', () => {
    expect(highlightCode('def foo():', 'python')).toEqual([
      seg('def', codeStyles.keyword),
      seg(' ', codeStyles.punctuation),
      seg('foo', codeStyles.function),
      seg('(', codeStyles.punctuation),
      seg(')', codeStyles.punctuation),
      seg(':', codeStyles.punctuation),
    ])
    expect(highlightCode('# note', 'python')).toEqual([seg('# note', codeStyles.comment)])
  })

  it('maps strings, classes and variables', () => {
    expect(highlightCode('const s = "hi"', 'js')).toEqual([
      seg('const', codeStyles.keyword),
      seg(' s ', codeStyles.punctuation),
      seg('=', codeStyles.punctuation),
      seg(' ', codeStyles.punctuation),
      seg('"hi"', codeStyles.string),
    ])
    expect(highlightCode('class Foo {}', 'java')).toEqual([
      seg('class', codeStyles.keyword),
      seg(' ', codeStyles.punctuation),
      seg('Foo', codeStyles['class-name']),
      seg(' ', codeStyles.punctuation),
      seg('{', codeStyles.punctuation),
      seg('}', codeStyles.punctuation),
    ])
  })

  it('resolves language aliases', () => {
    expect(highlightCode('echo hi', 'sh')?.map(s => s.text).join('')).toBe('echo hi')
    expect(highlightCode('echo hi', 'shell')?.map(s => s.text).join('')).toBe('echo hi')
    expect(highlightCode('const x = 1', 'ts')?.map(s => s.text).join('')).toBe('const x = 1')
    expect(highlightCode('SELECT 1', 'pgsql')?.map(s => s.text).join('')).toBe('SELECT 1')
  })

  it('returns null for unsupported languages', () => {
    expect(highlightCode('any text', 'foobar')).toBeNull()
  })

  it('handles partial streaming lines without throwing', () => {
    expect(highlightCode('const y =', 'js')?.map(s => s.text).join('')).toBe('const y =')
    expect(highlightCode('def foo(', 'python')?.map(s => s.text).join('')).toBe('def foo(')
  })
})

describe('wrapSegments', () => {
  it('splits segments across rows preserving style', () => {
    expect(wrapSegments([seg('aaa', mdStyles.bold), seg('bbb')], 4)).toEqual([
      [seg('aaa', mdStyles.bold), seg('b')],
      [seg('bb')],
    ])
  })

  it('breaks rows on newline segments', () => {
    expect(wrapSegments([seg('a'), seg('\n'), seg('b')], 10)).toEqual([[seg('a')], [seg('b')]])
  })

  it('merges adjacent runs with the same style', () => {
    expect(wrapSegments([seg('a'), seg('b', mdStyles.bold), seg('c', mdStyles.bold), seg('d')], 10)).toEqual([
      [seg('a'), seg('bc', mdStyles.bold), seg('d')],
    ])
  })

  it('returns a single empty row for empty content', () => {
    expect(wrapSegments([], 10)).toEqual([[]])
  })

  it('emits an empty row for a trailing newline', () => {
    expect(wrapSegments(tokenizeMarkdown('a\n'), 10)).toEqual([[seg('a')], []])
  })

  it('returns an empty row for a zero width', () => {
    expect(wrapSegments([seg('a')], 0)).toEqual([[]])
  })
})

describe('createSegmentWrapper', () => {
  function lcg(seed: number): () => number {
    let state = seed
    return () => {
      state = (state * 1_102_352_477 + 12_345) % 2_147_483_648
      return state / 2_147_483_648
    }
  }

  const FRAGMENTS = [
    'plain text ',
    '中文段落测试',
    '**bold** ',
    '`code` ',
    '# heading\n',
    '- list item\n',
    '```\ncode line\n```\n',
    '```ts\nconst x = 1\n```\n',
    '\n',
    'partial fence ```\n',
    'long word aaaaaaaaaaaaaaaaaaaaaa ',
  ]

  function randomContent(random: () => number): string {
    let out = ''
    const count = 4 + Math.floor(random() * 10)
    for (let i = 0; i < count; i++) out += FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]
    return out
  }

  function chunked(content: string, random: () => number): string[] {
    const chunks: string[] = []
    let rest = content
    while (rest.length > 0) {
      const size = 1 + Math.floor(random() * 9)
      chunks.push(rest.slice(0, size))
      rest = rest.slice(size)
    }
    return chunks
  }

  function layoutBatch(segments: Segment[], width: number): Segment[][] {
    const rows: Segment[][] = []
    let line: Segment[] = []
    const flush = (): void => {
      rows.push(...layoutLineSegments(line, width))
      line = []
    }
    for (const segment of segments) {
      if (segment.text === '\n') {
        flush()
        continue
      }
      line.push(segment)
    }
    flush()
    return rows
  }

  function expectIncrementalMatchesBatch(make: () => SegmentWrapper, tokenize: (content: string) => Segment[], seed: number, width: number): void {
    const random = lcg(seed)
    const content = randomContent(random)
    const wrapper = make()
    const chunks = chunked(content, lcg(seed + 1))
    let accumulated = ''
    for (const chunk of chunks) {
      accumulated += chunk
      const wrapped = wrapper.update(accumulated)
      const expected = layoutBatch(tokenize(accumulated), width)
      expect(wrapped.rows).toEqual(expected)
      expect(wrapped.lines).toEqual(expected.map(row => row.map(segment => segment.text).join('')))
    }
  }

  it('matches batch tokenization and wrapping for incremental markdown appends', () => {
    for (const seed of [1, 7, 42, 1337]) {
      for (const width of [20, 7, 3]) {
        expectIncrementalMatchesBatch(
          () => createSegmentWrapper(createMarkdownTokenizer(), width),
          tokenizeMarkdown,
          seed,
          width,
        )
      }
    }
  })

  it('matches batch tokenization and wrapping for incremental thinking appends', () => {
    for (const seed of [2, 9, 55, 2024]) {
      for (const width of [20, 7, 3]) {
        expectIncrementalMatchesBatch(
          () => createSegmentWrapper(createThinkingTokenizer(), width),
          tokenizeThinking,
          seed,
          width,
        )
      }
    }
  })

  it('rebuilds from scratch when content is not an append', () => {
    const wrapper = createSegmentWrapper(createMarkdownTokenizer(), 30)
    wrapper.update('# Title\n\nbody text here')
    const replaced = wrapper.update('totally different')
    expect(replaced.rows).toEqual(wrapSegments(tokenizeMarkdown('totally different'), 30))
  })

  it('keeps completed row identities stable across appends', () => {
    const wrapper = createSegmentWrapper(createMarkdownTokenizer(), 30)
    const first = wrapper.update('first line\nsec')
    const second = wrapper.update('first line\nsecond line\nthird')
    expect(second.rows[0]).toBe(first.rows[0])
    expect(second.rows[1]).not.toBe(first.rows[1])
    expect(second.rows).toEqual(wrapSegments(tokenizeMarkdown('first line\nsecond line\nthird'), 30))
  })
})