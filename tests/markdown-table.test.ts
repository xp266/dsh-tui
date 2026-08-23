import { describe, expect, it } from 'vitest'
import {
  buildMarkdownRows,
  hasMarkdownTable,
  layoutLineSegments,
  mdStyles,
} from '../src/ui/message/markdown.ts'
import type { Segment } from '../src/ui/message/markdown.ts'
import { textWidth } from '../src/core/text.ts'
import { BUBBLE_WIDTH_OFFSET } from '../src/core/metrics.ts'
import { rowIndexFor } from '../src/ui/message/layout.ts'
import type { Message } from '../src/model/message.ts'

const W = 60

function plain(rows: Segment[][]): string[] {
  return rows.map(row => row.map(segment => segment.text).join(''))
}

describe('markdown table rendering', () => {
  const table = [
    'Name | Description',
    '--- | ---',
    'alpha | first item',
    'beta | second **bold** item',
  ].join('\n')

  it('detects tables only with a separator row', () => {
    expect(hasMarkdownTable(table)).toBe(true)
    expect(hasMarkdownTable('| just pipes |\n| more |')).toBe(false)
  })

  it('renders standard borders with padded columns', () => {
    const { rows, lines } = buildMarkdownRows(table, W)
    expect(lines[0]).toMatch(/^┌─+┬─+┐$/)
    expect(lines[1]).toContain('│ Name ')
    expect(lines[1]).toMatch(/│ +Name +│ +Description +│/)
    expect(lines[2]).toMatch(/^├─+┼─+┤$/)
    expect(lines[3]).toContain('│ alpha ')
    expect(lines[3]).toContain('first item')
    expect(lines[4]).toContain('beta')
    expect(lines.at(-1)).toMatch(/^└─+┴─+┘$/)
    const widths = new Set(lines.map(line => textWidth(line)))
    expect(widths.size).toBe(1)
    expect([...widths][0]).toBeLessThanOrEqual(W)
    expect(plain(rows).join('\n')).toBe(lines.join('\n'))
  })

  it('keeps inline styling inside cells', () => {
    const { rows } = buildMarkdownRows(table, W)
    const bold = rows.find(row => row.some(segment => segment.style.bold === true && segment.text === 'bold'))
    expect(bold).toBeDefined()
  })

  it('wraps long cells across multiple border rows', () => {
    const content = 'K | V\n--- | ---\nkey | ' + 'verylongvalue'.repeat(6)
    const { lines } = buildMarkdownRows(content, W)
    const valueLines = lines.filter(line => line.includes('verylongvalue'))
    expect(valueLines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line)).toBeLessThanOrEqual(W)
    expect(lines.at(-1)).toMatch(/^└/)
  })

  it('stays consistent while streaming table rows in stages', () => {
    const stages = [
      'A | B',
      'A | B\n--- | ---',
      'A | B\n--- | ---\none | two',
      'A | B\n--- | ---\none | two\nthree | four',
    ]
    let sawHeader = false
    for (const content of stages) {
      const { lines } = buildMarkdownRows(content, W)
      if (hasMarkdownTable(content)) {
        expect(lines[0]).toMatch(/^┌/)
        expect(lines.at(-1)).toMatch(/^└/)
        if (content.includes('one')) {
          const header = lines.find(line => line.includes(' A '))
          expect(header?.includes(' B ')).toBe(true)
          sawHeader = true
        }
      } else {
        expect(lines.join('\n')).toContain('A | B')
      }
    }
    expect(sawHeader).toBe(true)
  })

  it('stays aligned when forced to shrink wide CJK and emoji columns', () => {
    const content = [
      '命令 | 结果 | 详细说明',
      '--- | --- | ---',
      'rm /tmp/a.txt | ❌ 被拒 | 只读文件系统拒绝写入操作',
      'git status | ✅ 正常 | 返回工作区状态与变更列表内容',
    ].join('\n')
    for (const width of [30, 24, 20]) {
      const { lines } = buildMarkdownRows(content, width)
      const widths = new Set(lines.map(line => textWidth(line)))
      expect(widths.size, `width ${width}`).toBe(1)
      const total = [...widths][0]!
      expect(total).toBeLessThanOrEqual(width)
      expect(total).toBeLessThanOrEqual(width - 2)
    }
  })

  it('respects the two-column minimum for wide-only columns', () => {
    const content = '中文名 | x\n--- | ---\n很长很长的中文内容在这里 | y'
    const { lines } = buildMarkdownRows(content, 16)
    const widths = new Set(lines.map(line => textWidth(line)))
    expect(widths.size).toBe(1)
    expect(lines[1]).toContain('│ 中文名')
  })

  it('keeps every row identical when a cell cannot wrap further', () => {
    const content = 'A | B\n--- | ---\n你 | 我'
    const { lines } = buildMarkdownRows(content, 14)
    const widths = new Set(lines.map(line => textWidth(line)))
    expect(widths.size).toBe(1)
  })

  it('ignores pipe lines inside fenced code blocks', () => {
    const content = '```\n| a | b |\n|---|---|\n| c | d |\n```'
    const { lines } = buildMarkdownRows(content, W)
    expect(lines.join('\n')).not.toContain('┌')
    expect(lines.join('\n')).toContain('| a | b |')
  })
})

describe('list hanging indent', () => {
  it('aligns wrapped continuation under the list text', () => {
    const segments: Segment[] = [
      { text: '- ', style: mdStyles.list },
      { text: '拒绝是策略性的（policy denial），不是工具故障；沙箱会明确给出标记和升级提示说明文字足够长以触发折行', style: mdStyles.plain },
    ]
    const rows = layoutLineSegments(segments, 30)
    const texts = plain(rows)
    expect(texts[0]).toMatch(/^- /)
    expect(rows.length).toBeGreaterThan(1)
    for (let i = 1; i < texts.length; i++) {
      expect(texts[i].startsWith('  ')).toBe(true)
      expect(textWidth(texts[i])).toBeLessThanOrEqual(30)
    }
  })

  it('uses the marker width of numbered lists', () => {
    const segments: Segment[] = [
      { text: '10. ', style: mdStyles.list },
      { text: 'x'.repeat(60), style: mdStyles.plain },
    ]
    const rows = layoutLineSegments(segments, 30)
    const texts = plain(rows)
    expect(rows.length).toBeGreaterThan(1)
    for (let i = 1; i < texts.length; i++) {
      expect(texts[i].startsWith('    ')).toBe(true)
    }
  })
})

describe('permission report table via row index', () => {
  it('renders the 6-column report aligned inside the bubble width', () => {
    const content = [
      '| 场景 | 工具 | 目标（工作区外） | 裸试结果 | 提权参数 | 批准后结果 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| A | write | /home/xp266/dsh-perm-test/write-tool.txt（新建） | ❌ [sandbox: file access denied under workspace-write mode] | danger-full-access + justification | ✅ 文件创建成功 |',
      '| B | bash | mkdir -p …/sub + printf > 重定向 + touch + >> 追加 | ❌ 同上拒绝，且底层报 Read-only file system（双重拦截） | danger-full-access + justification | ✅ 4 条写入指令全部生效 |',
      '| C | edit | 修改场景 A 创建的文件 | ❌ 同上拒绝 | danger-full-access + justification | ✅ 替换成功 |',
    ].join('\n')
    const messages: Message[] = [
      { kind: 'bubble', id: 't', role: 'assistant', content },
    ]
    const columns = 80
    const inner = columns - BUBBLE_WIDTH_OFFSET
    const index = rowIndexFor(messages, columns)
    const rendered: string[] = []
    for (let row = 0; row < index.total; row++) {
      const info = index.rowAt(row)
      if (info === null || info.kind !== 'text') continue
      const text = info.segments !== undefined
        ? info.segments.map(segment => segment.text).join('')
        : info.text
      rendered.push(text)
    }
    expect(rendered.some(line => line.startsWith('┌'))).toBe(true)
    expect(rendered.some(line => line.startsWith('└'))).toBe(true)
    for (const line of rendered) {
      expect(textWidth(line)).toBeLessThanOrEqual(inner)
    }
    const borderRows = rendered.filter(line => /^┌|^├|^└/.test(line))
    const borderWidths = new Set(borderRows.map(line => textWidth(line)))
    expect(borderWidths.size).toBe(1)
    const contentRows = rendered.filter(line => line.startsWith('│'))
    const contentWidths = new Set(contentRows.map(line => textWidth(line)))
    expect(contentWidths.size).toBe(1)
    expect([...contentWidths][0]).toBe([...borderWidths][0])
  })
})
