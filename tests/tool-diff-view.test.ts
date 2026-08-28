import { describe, expect, it } from 'vitest'
import type { Message, ToolDiffMessage } from '../src/model/message.ts'
import { rowCount, rowInfoAt } from '../src/ui/message/layout.ts'
import { languageFromPath, renderToolDiffBody, sniffLanguage, toolDiffHeader } from '../src/ui/message/tool-diff.ts'
import { COLORS } from '../src/theme.ts'

const WIDTH = 80

function diffMessage(overrides: Partial<ToolDiffMessage> = {}): ToolDiffMessage {
  return {
    kind: 'tool-diff',
    id: 'd1',
    tool: 'write',
    path: 'minecraft-web/test/test.js',
    hunks: [],
    ...overrides,
  }
}

describe('tool diff bubbles', () => {
  it('lays out pad, header, gap, body, pad, blank rows', () => {
    const messages: Message[] = [diffMessage({
      hunks: [[
        { kind: 'add', text: 'const a = 1' },
        { kind: 'add', text: 'const b = 2' },
      ]],
    })]
    expect(rowCount(messages, WIDTH)).toBe(2 + 5)
    expect(rowInfoAt(messages, WIDTH, 0)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt(messages, WIDTH, 1)).toMatchObject({ kind: 'text', text: 'write minecraft-web/test/test.js', colStart: 4, muted: true, background: true })
    expect(rowInfoAt(messages, WIDTH, 2)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt(messages, WIDTH, 3)).toMatchObject({ kind: 'text', text: '+ const a = 1', colStart: 4 })
    expect(rowInfoAt(messages, WIDTH, 4)).toMatchObject({ kind: 'text', text: '+ const b = 2' })
    expect(rowInfoAt(messages, WIDTH, 5)).toMatchObject({ kind: 'pad' })
    expect(rowInfoAt(messages, WIDTH, 6)).toMatchObject({ kind: 'blank' })
  })

  it('keeps tool bubbles free of spinners while streaming', () => {
    const messages: Message[] = [diffMessage({ streaming: true })]
    expect(rowCount(messages, WIDTH)).toBe(4)
    const header = rowInfoAt(messages, WIDTH, 1)
    expect(header?.kind).toBe('text')
    expect(header?.spinner ?? false).toBe(false)
    expect(rowInfoAt(messages, WIDTH, 3)?.kind).toBe('blank')
  })

  it('aligns markers with the header and continuations under the code column', () => {
    const bodyWidth = WIDTH - 8
    const rendered = renderToolDiffBody(diffMessage({
      hunks: [[{ kind: 'add', text: 'x'.repeat(200) }]],
    }), bodyWidth)
    expect(rendered.lines[0]).toBe(`+ ${'x'.repeat(bodyWidth - 2)}`)
    expect(rendered.lines[1]!.startsWith('  ')).toBe(true)
    expect(rendered.bgs[1]).toBeUndefined()
  })

  it('keeps write additions free of line backgrounds and green-marked', () => {
    const rendered = renderToolDiffBody(diffMessage({
      hunks: [[{ kind: 'add', text: 'const a = 1' }]],
    }), WIDTH - 8)
    expect(rendered.bgs).toEqual([undefined])
    const marker = rendered.rows[0]![0]!
    expect(marker.text).toBe('+')
    expect(marker.style.color).toBe(COLORS.diffAdded)
  })

  it('paints deep red and green backgrounds for edit removals and additions', () => {
    const rendered = renderToolDiffBody(diffMessage({
      tool: 'edit',
      hunks: [[{ kind: 'del', text: 'old()' }, { kind: 'add', text: 'new()' }]],
    }), WIDTH - 8)
    expect(rendered.bgs).toEqual([COLORS.diffRemovedBackground, COLORS.diffAddedBackground])
    expect(rendered.rows[0]![0]).toMatchObject({ text: '-', style: { color: COLORS.diffRemoved } })
    expect(rendered.lines[0]).toBe('- old()')
    expect(rendered.lines[1]).toBe('+ new()')
  })

  it('leaves context lines unhighlighted backgrounds and prefixes them with spaces', () => {
    const rendered = renderToolDiffBody(diffMessage({
      tool: 'edit',
      hunks: [[
        { kind: 'ctx', text: '// keep' },
        { kind: 'del', text: 'a' },
        { kind: 'add', text: 'b' },
        { kind: 'ctx', text: '// tail' },
      ]],
    }), WIDTH - 8)
    expect(rendered.bgs[0]).toBeUndefined()
    expect(rendered.bgs[3]).toBeUndefined()
    expect(rendered.lines[0]).toBe('  // keep')
    expect(rendered.lines[3]).toBe('  // tail')
    expect(rendered.lines[1]).toBe('- a')
    expect(rendered.lines[2]).toBe('+ b')
  })

  it('syntax highlights code segments using the path language', () => {
    const rendered = renderToolDiffBody(diffMessage({
      hunks: [[{ kind: 'add', text: 'const a = 1' }]],
    }), WIDTH - 8)
    const styles = rendered.rows[0]!.map(segment => segment.style)
    expect(styles.some(style => style.color === COLORS.codeKeyword)).toBe(true)
  })

  it('appends the error line after a blank separator', () => {
    const rendered = renderToolDiffBody(diffMessage({
      error: 'error: FS_NOT_FOUND missing file',
      hunks: [[{ kind: 'add', text: 'a' }]],
    }), WIDTH - 8)
    expect(rendered.lines).toHaveLength(3)
    expect(rendered.lines[1]).toBe('')
    expect(rendered.lines[2]).toBe('error: FS_NOT_FOUND missing file')
    expect(rendered.rows[2]![0].style.color).toBe(COLORS.errorText)
  })

  it('derives prism languages from file paths', () => {
    expect(languageFromPath('src/ui/App.tsx')).toBe('typescript')
    expect(languageFromPath('script.py')).toBe('python')
    expect(languageFromPath('Dockerfile')).toBe('docker')
    expect(languageFromPath('Makefile')).toBe('makefile')
    expect(languageFromPath('data.unknown')).toBe('')
    expect(languageFromPath('README')).toBe('')
  })

  it('sniffs the language from content while the path is still unknown', () => {
    const rendered = renderToolDiffBody(diffMessage({ path: '', hunks: [[{ kind: 'add', text: 'const a = 1' }]] }), WIDTH - 8)
    const styles = rendered.rows[0]!.map(segment => segment.style)
    expect(styles.some(style => style.color === COLORS.codeKeyword)).toBe(true)
  })

  it('sniffs common languages from characteristic syntax', () => {
    expect(sniffLanguage('def main():\n    print(1)')).toBe('python')
    expect(sniffLanguage('package main\n\nfunc Run() {}')).toBe('go')
    expect(sniffLanguage('#!/bin/bash\necho hi')).toBe('bash')
    expect(sniffLanguage('{"a": 1}')).toBe('json')
    expect(sniffLanguage('random plain notes here')).toBe('')
  })

  it('renders just the tool name when no path is known yet', () => {
    expect(toolDiffHeader(diffMessage({ path: '' }))).toBe('write')
    expect(toolDiffHeader(diffMessage())).toBe('write minecraft-web/test/test.js')
  })
})
