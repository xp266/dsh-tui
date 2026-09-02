import { describe, expect, it } from 'vitest'
import type { Message, ToolCardMessage } from '../src/model/message.ts'
import { rowCount, rowInfoAt } from '../src/ui/message/layout.ts'
import { languageFromPath, renderToolDiffBody, renderToolReadBody, sniffLanguage } from '../src/ui/message/tool-diff.ts'
import { COLORS } from '../src/theme.ts'

const WIDTH = 80

function diffCard(overrides: Partial<ToolCardMessage> = {}): ToolCardMessage {
  return {
    kind: 'tool-card',
    id: 'd1',
    tool: 'write',
    label: 'write minecraft-web/test/test.js',
    argsBody: '',
    running: false,
    ...overrides,
  }
}

describe('tool diff bubbles', () => {
  it('lays out pad, header, gap, body, pad, blank rows', () => {
    const messages: Message[] = [diffCard({
      diff: {
        path: 'minecraft-web/test/test.js',
        hunks: [[
          { kind: 'add', text: 'const a = 1' },
          { kind: 'add', text: 'const b = 2' },
        ]],
      },
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
    const messages: Message[] = [diffCard({ label: 'write', streaming: true, running: true })]
    expect(rowCount(messages, WIDTH)).toBe(4)
    const header = rowInfoAt(messages, WIDTH, 1)
    expect(header?.kind).toBe('text')
    expect(header?.spinner ?? false).toBe(false)
    expect(rowInfoAt(messages, WIDTH, 3)?.kind).toBe('blank')
  })

  it('aligns markers with the header and continuations under the code column', () => {
    const bodyWidth = WIDTH - 8
    const rendered = renderToolDiffBody({
      tool: 'write',
      path: 'a.js',
      hunks: [[{ kind: 'add', text: 'x'.repeat(200) }]],
    }, bodyWidth)
    expect(rendered.lines[0]).toBe(`+ ${'x'.repeat(bodyWidth - 2)}`)
    expect(rendered.lines[1]!.startsWith('  ')).toBe(true)
    expect(rendered.bgs[1]).toBeUndefined()
  })

  it('keeps write additions free of line backgrounds and green-marked', () => {
    const rendered = renderToolDiffBody({
      tool: 'write',
      path: 'a.js',
      hunks: [[{ kind: 'add', text: 'const a = 1' }]],
    }, WIDTH - 8)
    expect(rendered.bgs).toEqual([undefined])
    const marker = rendered.rows[0]![0]!
    expect(marker.text).toBe('+')
    expect(marker.style.color).toBe(COLORS.diffAdded)
  })

  it('paints deep red and green backgrounds for edit removals and additions', () => {
    const rendered = renderToolDiffBody({
      tool: 'edit',
      path: 'a.js',
      hunks: [[{ kind: 'del', text: 'old()' }, { kind: 'add', text: 'new()' }]],
    }, WIDTH - 8)
    expect(rendered.bgs).toEqual([COLORS.diffRemovedBackground, COLORS.diffAddedBackground])
    expect(rendered.rows[0]![0]).toMatchObject({ text: '-', style: { color: COLORS.diffRemoved } })
    expect(rendered.lines[0]).toBe('- old()')
    expect(rendered.lines[1]).toBe('+ new()')
  })

  it('leaves context lines without backgrounds and prefixes them with spaces', () => {
    const rendered = renderToolDiffBody({
      tool: 'edit',
      path: 'a.js',
      hunks: [[
        { kind: 'ctx', text: '// keep' },
        { kind: 'del', text: 'a' },
        { kind: 'add', text: 'b' },
        { kind: 'ctx', text: '// tail' },
      ]],
    }, WIDTH - 8)
    expect(rendered.bgs[0]).toBeUndefined()
    expect(rendered.bgs[3]).toBeUndefined()
    expect(rendered.lines[0]).toBe('  // keep')
    expect(rendered.lines[3]).toBe('  // tail')
    expect(rendered.lines[1]).toBe('- a')
    expect(rendered.lines[2]).toBe('+ b')
  })

  it('syntax highlights code segments using the path language', () => {
    const rendered = renderToolDiffBody({
      tool: 'write',
      path: 'a.js',
      hunks: [[{ kind: 'add', text: 'const a = 1' }]],
    }, WIDTH - 8)
    const styles = rendered.rows[0]!.map(segment => segment.style)
    expect(styles.some(style => style.color === COLORS.codeKeyword)).toBe(true)
  })

  it('appends the error line after a blank separator', () => {
    const rendered = renderToolDiffBody({
      tool: 'write',
      path: 'a.js',
      error: 'error: FS_NOT_FOUND missing file',
      hunks: [[{ kind: 'add', text: 'a' }]],
    }, WIDTH - 8)
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
    const rendered = renderToolDiffBody({ tool: 'write', path: '', hunks: [[{ kind: 'add', text: 'const a = 1' }]] }, WIDTH - 8)
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
    expect(rowInfoAt([diffCard({ label: 'write' })], WIDTH, 1)).toMatchObject({ kind: 'text', text: 'write' })
  })

  it('marks a failed result card with an error line', () => {
    const messages: Message[] = [diffCard({ label: 'write a.ts', failed: true })]
    const count = rowCount(messages, WIDTH)
    const last = rowInfoAt(messages, WIDTH, count - 3)
    expect(last).toMatchObject({ kind: 'text' })
    expect(last?.segments?.[0]).toMatchObject({ text: 'failed', style: { color: COLORS.errorText } })
  })

  it('renders a failed result text as the error instead of adding a failed line', () => {
    const messages: Message[] = [diffCard({
      label: 'exit_plan_mode',
      resultBody: 'Error: exit_plan_mode is only available in plan mode\n',
      failed: true,
    })]
    const frame = rowCount(messages, WIDTH)
    const bodyRow = rowInfoAt(messages, WIDTH, 3)
    expect(bodyRow?.text).toBe('Error: exit_plan_mode is only available in plan mode')
    expect(bodyRow?.segments?.[0]).toMatchObject({
      text: 'Error: exit_plan_mode is only available in plan mode',
      style: { color: COLORS.errorText },
    })
    expect(rowInfoAt(messages, WIDTH, frame - 3)?.segments?.[0]?.text).not.toBe('failed')
  })

  it('keeps styled error rows aligned with their own line, never over a body line', () => {
    const messages: Message[] = [diffCard({
      label: 'create_goal goal',
      resultBody: 'Verify that the goal tools are available.\n\nError: this goal operation requires a direct human turn.',
      error: 'error: HarnessError',
    })]
    // body rows: two text lines, a blank, then the styled error line
    const first = rowInfoAt(messages, WIDTH, 3)
    expect(first?.text).toBe('Verify that the goal tools are available.')
    expect(first?.segments).toBeUndefined()
    const errorRow = rowInfoAt(messages, WIDTH, 6)
    expect(errorRow?.text).toBe('error: HarnessError')
    expect(errorRow?.segments?.[0]).toMatchObject({ text: 'error: HarnessError', style: { color: COLORS.errorText } })
  })

  it('renders nested code-dispatch children under the root card', () => {
    const child: ToolCardMessage = {
      kind: 'tool-card',
      id: 'c1',
      tool: 'read',
      label: 'read src/a.ts',
      argsBody: '',
      running: false,
      resultBody: 'ok',
    }
    const messages: Message[] = [diffCard({ label: 'run_code', nested: [child] })]
    const count = rowCount(messages, WIDTH)
    const nestedRow = rowInfoAt(messages, WIDTH, count - 3)
    expect(nestedRow?.kind).toBe('text')
    expect(nestedRow?.text).toContain('read src/a.ts')
  })
})

describe('tool read cards', () => {
  it('renders a numbered gutter beside highlighted code', () => {
    const rendered = renderToolReadBody({
      path: 'src/a.ts',
      lines: [
        { number: 9, text: 'const a = 1' },
        { number: 10, text: 'const b = 2' },
      ],
      totalLines: 40,
    }, WIDTH - 8)
    expect(rendered.lines[0]).toBe(' 9 const a = 1')
    expect(rendered.lines[1]).toBe('10 const b = 2')
    const styles = rendered.rows[0]!.map(segment => segment.style)
    expect(styles.some(style => style.color === COLORS.codeKeyword)).toBe(true)
  })

  it('closes short windows with a lines N of M footer', () => {
    const rendered = renderToolReadBody({
      path: 'src/a.ts',
      lines: [{ number: 1, text: 'a' }],
      totalLines: 100,
    }, WIDTH - 8)
    expect(rendered.lines).toHaveLength(2)
    expect(rendered.lines[1]).toBe('... lines 1-1 of 100')
  })

  it('omits the footer when the window reaches the end of the file', () => {
    const rendered = renderToolReadBody({
      path: 'src/a.ts',
      lines: [
        { number: 1, text: 'a' },
        { number: 2, text: 'b' },
      ],
      totalLines: 2,
    }, WIDTH - 8)
    expect(rendered.lines).toHaveLength(2)
  })

  it('reports an empty window against the file total', () => {
    const rendered = renderToolReadBody({
      path: 'src/a.ts',
      lines: [],
      offset: 50,
      totalLines: 100,
    }, WIDTH - 8)
    expect(rendered.lines).toEqual(['... empty window at line 50 of 100'])
  })
})
