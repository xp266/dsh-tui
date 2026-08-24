import { describe, expect, it } from 'vitest'
import { createMarkdownRenderer, renderMarkdown } from '../src/ui/message/md/index.ts'
import { createMdPalette } from '../src/ui/message/md/palette.ts'
import { codeStyles, codeStylesDark, highlightCodeBlock } from '../src/ui/message/md/highlight.ts'
import { wrapSegments } from '../src/core/segments.ts'
import type { MarkStyle, Segment } from '../src/core/segments.ts'

const light = createMdPalette(false)
const think = createMdPalette(true)

function seg(text: string, style: MarkStyle = light.plain): Segment {
  return { text, style }
}

function lines(md: string, width = 80, thinking = false): string[] {
  return renderMarkdown(md, width, thinking).lines
}

function rows(md: string, width = 80, thinking = false): Segment[][] {
  return renderMarkdown(md, width, thinking).rows
}

describe('renderMarkdown inline', () => {
  it('renders bold with the orange bold style and strips the markers', () => {
    expect(rows('**bold**')).toEqual([[seg('bold', light.bold)]])
  })

  it('keeps text around inline markers as plain', () => {
    expect(rows('a**b**c')).toEqual([[seg('a'), seg('b', light.bold), seg('c')]])
  })

  it('renders inline code green and strips the backticks', () => {
    expect(rows('use `code` here')).toEqual([[seg('use '), seg('code', light.inlineCode), seg(' here')]])
  })

  it('applies bold style to the remainder when unclosed (streaming)', () => {
    expect(rows('hello **wor')).toEqual([[seg('hello '), seg('wor', light.bold)]])
  })

  it('applies inline code style to the remainder when unclosed (streaming)', () => {
    expect(rows('use `cod')).toEqual([[seg('use '), seg('cod', light.inlineCode)]])
  })

  it('parses double-backtick code spans containing backticks', () => {
    expect(rows('use ``a ` b`` end')).toEqual([[seg('use '), seg('a ` b', light.inlineCode), seg(' end')]])
  })

  it('consumes escaped punctuation', () => {
    expect(rows('multiply 2 \\* 3')).toEqual([[seg('multiply 2 * 3')]])
  })

  it('renders italics with the italic flag', () => {
    expect(rows('plain *em* tail')).toEqual([[seg('plain '), seg('em', light.italic), seg(' tail')]])
  })

  it('renders bold-italic triple delimiters without stray asterisks', () => {
    expect(rows('***both***')).toEqual([[{ text: 'both', style: { color: light.bold.color, bold: true, italic: true } }]])
  })

  it('renders strikethrough with the strike flag', () => {
    expect(rows('~~gone~~')).toEqual([[seg('gone', light.strike)]])
  })

  it('renders links as underlined link-colored text without the url', () => {
    expect(rows('see [docs](https://example.com) now')).toEqual([[
      seg('see '),
      { text: 'docs', style: { color: light.link.color, underline: true } },
      seg(' now'),
    ]])
  })
})

describe('renderMarkdown blocks', () => {
  it('renders h1 with an underline rule and strips the hashes', () => {
    expect(lines('# Title')).toEqual(['Title', '═════'])
    expect(rows('# Title')[0]).toEqual([seg('Title', light.heading(1))])
  })

  it('renders h2 with a dash rule and h3 without one', () => {
    expect(lines('## Head')).toEqual(['Head', '────'])
    expect(lines('### Head')).toEqual(['Head'])
    expect(rows('## Head')[0]).toEqual([seg('Head', light.heading(2))])
    expect(rows('### Head')[0]).toEqual([seg('Head', light.heading(3))])
  })

  it('supports setext headings', () => {
    expect(lines('Setext Title\n============')).toEqual(['Setext Title', '════════════'])
  })

  it('strips closing hashes from headings', () => {
    expect(lines('## My Title ##')).toEqual(['My Title', '────────'])
  })

  it('colors list markers and keeps item text plain', () => {
    const row = rows('- item')[0]!
    expect(row[0]).toEqual(seg('•', light.listMarker))
    expect(row.map(s => s.text).join('')).toBe('• item')
    expect(lines('1. ordered')).toEqual(['1. ordered'])
    expect(lines('12. numbered')).toEqual(['12. numbered'])
  })

  it('does not treat plain digits or dashes as list markers', () => {
    expect(lines('1.5 version')).toEqual(['1.5 version'])
    expect(lines('-x')).toEqual(['-x'])
  })

  it('indents nested list children under their parent text', () => {
    expect(lines('- a\n  - b')).toEqual(['• a', '  ◦ b'])
    expect(lines('- a\n  - b\n    - c')).toEqual(['• a', '  ◦ b', '    ▪ c'])
  })

  it('renders task list checkboxes instead of bullets', () => {
    expect(lines('- [x] done\n- [ ] todo')).toEqual(['☑ done', '☐ todo'])
    expect(rows('- [x] done')[0]![0]).toEqual(seg('☑', light.taskDone))
    expect(rows('- [ ] todo')[0]![0]).toEqual(seg('☐', light.taskTodo))
  })

  it('renders quotes as bar-prefixed rows without the > markers', () => {
    expect(lines('> quoted one\n> quoted two')).toEqual(['▌ quoted one', '▌ quoted two'])
    expect(rows('> quoted')[0]![0]).toEqual(seg('▌', light.quoteBar))
  })

  it('renders hr as a full-width rule', () => {
    expect(lines('---', 40)).toEqual(['─'.repeat(40)])
  })

  it('normalizes blank lines between blocks to a single separator', () => {
    expect(lines('a\n\n\n\nb')).toEqual(['a', '', 'b'])
  })

  it('hides link reference definitions and resolves references', () => {
    const md = '[foo]: https://example.com "T"\n\nsee [foo]'
    const result = rows(md)
    expect(result).toHaveLength(1)
    expect(result[0]!.at(-1)).toEqual({ text: 'foo', style: { color: light.link.color, underline: true } })
  })

  it('keeps inline html visible as plain text', () => {
    expect(lines('a <br> b')).toEqual(['a \n b'].flatMap(l => l.split('\n')))
  })
})

describe('renderMarkdown code blocks', () => {
  it('styles code blocks with the language palette and strips the fences', () => {
    expect(rows('```python\nprint(1)\n```')).toEqual([
      [seg('print', codeStyles.keyword), seg('(', codeStyles.punctuation), seg('1', codeStyles.number), seg(')', codeStyles.punctuation)],
    ])
    expect(lines('```python\nprint(1)\n```')).toEqual(['print(1)'])
  })

  it('styles no-language code blocks in the fallback green', () => {
    expect(rows('```\ncode\n```')).toEqual([[seg('code', light.codeFallback)]])
  })

  it('continues the code style to the end when the fence is unclosed (streaming)', () => {
    expect(rows('```js\nconst x = 1')).toEqual([
      [seg('const', codeStyles.keyword), seg(' x = ', codeStyles.punctuation), seg('1', codeStyles.number)],
    ])
  })

  it('does not parse inline markers inside code blocks', () => {
    expect(lines('```\n**bold** `code`\n```')).toEqual(['**bold** `code`'])
  })

  it('highlights blocks whose info string has trailing parameters', () => {
    const result = rows('```ts twoslash\nconst x = 1\n```')
    expect(result[0]).toEqual(expect.arrayContaining([seg('const', codeStyles.keyword)]))
  })

  it('supports tilde fences', () => {
    expect(rows('~~~python\nx = "v"\n~~~').flat().some(s => s.style.color === codeStyles.string.color && s.text.includes('"v"'))).toBe(true)
  })

  it('keeps inner triple backticks visible inside a longer backtick fence', () => {
    expect(lines('````markdown\n```py\nx = 1\n```\n````')).toEqual(['```py', 'x = 1', '```'])
  })

  it('renders fenced code inside list indentation without losing characters', () => {
    const result = lines('- step\n  ```bash\n  echo hi\n  ```\n- next')
    expect(result.join('\n')).not.toContain('`')
    expect(result.filter(text => text.includes('echo'))[0]).toContain('echo hi')
  })

  it('colors complete multi-line docstrings as strings', () => {
    const md = '```python\ndef f():\n    """first line\n\n    second line\n    """\n    return 1\n```'
    for (const [index, row] of rows(md, 200).entries()) {
      const text = row.map(s => s.text).join('')
      if (!text.includes('first line') && !text.includes('second line')) continue
      for (const s of row) {
        if (s.style.color === codeStyles.string.color) continue
        expect(/^[ \t]*$/.test(s.text), `${index}: ${JSON.stringify(s)}`).toBe(true)
      }
    }
  })

  it('does not add hanging indent to bullet-shaped lines inside no-language fences', () => {
    const md = '```\n- download_file_and_verify_checksum_from_mirror\n```'
    const result = rows(md, 30)
    expect(result.flat().map(s => s.text).join('')).toBe('- download_file_and_verify_checksum_from_mirror')
    for (const s of result.flat()) {
      expect(s.style.color).toBe(light.codeFallback.color)
    }
  })
})

describe('renderMarkdown tables', () => {
  const table = [
    'Name | Description',
    '--- | ---',
    'alpha | first item',
    'beta | second **bold** item',
  ].join('\n')

  it('renders standard borders with padded columns', () => {
    const result = renderMarkdown(table, 60)
    expect(result.lines[0]).toMatch(/^┌─+┬─+┐$/)
    expect(result.lines[1]).toMatch(/│ +Name +│ +Description +│/)
    expect(result.lines.at(-1)).toMatch(/^└─+┴─+┘$/)
    expect(result.lines.join('\n')).not.toContain('---')
  })

  it('keeps inline styling inside cells', () => {
    const bold = rows(table, 60).find(row => row.some(segment => segment.style.bold === true && segment.text === 'bold'))
    expect(bold).toBeDefined()
  })
})

describe('thinking rendering', () => {
  it('uses the dimmed palette and strips markers identically to normal mode', () => {
    expect(rows('use `code` here', 80, true)).toEqual([
      [seg('use ', think.plain), seg('code', think.inlineCode), seg(' here', think.plain)],
    ])
    expect(think.inlineCode.color).not.toBe(light.inlineCode.color)
    expect(think.bold.color).not.toBe(light.bold.color)
  })

  it('no longer applies a special quote style', () => {
    expect(rows('say "hi" now', 80, true)).toEqual([[seg('say "hi" now', think.plain)]])
  })

  it('styles the remainder when unclosed (streaming)', () => {
    expect(rows('`code', 80, true)).toEqual([[seg('code', think.inlineCode)]])
  })

  it('uses the darkened code palette in thinking mode', () => {
    expect(lines('```python\nprint(1)\n```', 80, true)).toEqual(['print(1)'])
    const row = rows('```js\nconst x = 1', 80, true)[0]!
    expect(row).toEqual(expect.arrayContaining([seg('const', codeStylesDark.keyword)]))
    expect(row.some(s => s.style.color === codeStyles.keyword.color)).toBe(false)
  })
})

describe('renderer streaming parity', () => {
  function lcg(seed: number): () => number {
    let state = seed
    return () => {
      state = (state * 1_102_352_477 + 12_345) % 2_147_483_648
      return state / 2_147_483_648
    }
  }

  const FRAGMENTS = [
    'plain text ',
    '中文段落测试 ',
    '**bold** ',
    '`code` ',
    '# heading\n',
    '- list item\n',
    '```\ncode line\n```\n',
    '```ts\nconst x = 1\n```\n',
    '\n',
    '> quote\n',
    '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
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

  it('matches one-shot rendering for incremental appends', () => {
    for (const seed of [1, 7, 42, 1337]) {
      for (const width of [80, 20]) {
        const random = lcg(seed)
        const content = randomContent(random)
        const renderer = createMarkdownRenderer(width)
        const chunks = chunked(content, lcg(seed + 1))
        let accumulated = ''
        for (const chunk of chunks) {
          accumulated += chunk
          const streamed = renderer.update(accumulated)
          const expected = renderMarkdown(accumulated, width)
          expect(streamed.rows).toEqual(expected.rows)
          expect(streamed.lines).toEqual(expected.lines)
        }
      }
    }
  })

  it('reuses cached block rows across appends', () => {
    const renderer = createMarkdownRenderer(30)
    const first = renderer.update('# Head\n\ntail')
    const second = renderer.update('# Head\n\ntail more')
    expect(second.rows[0]).toBe(first.rows[0])
    expect(second.rows[1]).toBe(first.rows[1])
    expect(second.rows.at(-1)).not.toBe(first.rows.at(-1))
  })
})
