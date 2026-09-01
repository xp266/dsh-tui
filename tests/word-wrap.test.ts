import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { wrapLines } from '../src/core/text.ts'
import { renderMarkdown } from '../src/ui/message/md/index.ts'
import { wrapSegments } from '../src/core/segments.ts'

describe('word wrapping', () => {
  it('moves short words whole to the next line', () => {
    expect(wrapLines('hello world foo', 8)).toEqual(['hello ', 'world ', 'foo'])
  })

  it('force-breaks words longer than a full line', () => {
    expect(wrapLines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('keeps break-after delimiters at the end of the line', () => {
    expect(wrapLines('hello, world foo bar', 7)).toEqual(['hello, ', 'world ', 'foo bar'])
    expect(wrapLines('路径 /home/xp266/very-long-directory-name/file.txt 继续', 12)).toEqual([
      '路径 /home/',
      'xp266/very-',
      'long-',
      'directory-',
      'name/file.',
      'txt 继续',
    ])
  })

  it('never starts a line with closing punctuation', () => {
    expect(wrapLines('aaaa.bbb', 4)).toEqual(['aaa', 'a.', 'bbb'])
    expect(wrapLines('中文，中文', 4)).toEqual(['中', '文，', '中文'])
  })

  it('never ends a line with an opening bracket', () => {
    expect(wrapLines('xx（中文', 4)).toEqual(['xx', '（中', '文'])
  })

  it('breaks CJK text per character', () => {
    expect(wrapLines('中文测试', 4)).toEqual(['中文', '测试'])
  })

  it('breaks at CJK and ASCII transitions', () => {
    expect(wrapLines('中文abc文', 5)).toEqual(['中文', 'abc文'])
  })

  it('keeps every wrapped row within the width', () => {
    const samples = [
      'hello world foo',
      'aaaa.bbb',
      '中文，中文测试 abcdefgh 中文',
      'path /usr/local/share/some/deep/dir/file.tar.gz end',
      'mix 中文 english words 中文标点，测试！',
    ]
    for (const text of samples) {
      for (const width of [4, 7, 10, 16, 30]) {
        for (const row of wrapLines(text, width)) {
          expect(stringWidth(row), `${JSON.stringify(text)} @${width}`).toBeLessThanOrEqual(width)
        }
      }
    }
  })

  it('wraps plain lines and styled segments at identical boundaries', () => {
    const samples = [
      '中文 abc def 中文测试 hello',
      'a very long english sentence with punctuation, commas, and more words',
      '路径 /home/xp266/file.txt 加中文混合 paragraph',
    ]
    for (const text of samples) {
      for (const width of [6, 11, 20]) {
        const plain = wrapLines(text, width)
        const styled = renderMarkdown(text, width).rows
        expect(styled.map(row => row.map(segment => segment.text).join('')), `${text} @${width}`).toEqual(plain)
      }
    }
  })

  it('normalizes tabs and carriage returns identically in both wrap paths', () => {
    const input = 'a\tb\r\nc\td'
    const plain = wrapLines(input, 20)
    const styled = wrapSegments([{ text: input, style: {} }], 20).map(row => row.map(segment => segment.text).join(''))
    expect(plain).toEqual(['a    b', 'c    d'])
    expect(styled).toEqual(['a    b', 'c    d'])
    expect(wrapLines('a\rb', 20)).toEqual(['a', 'b'])
    expect(wrapLines('a\tb', 20)).toEqual(['a    b'])
  })
})
