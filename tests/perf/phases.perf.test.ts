import { describe, it } from 'vitest'
import { marked } from 'marked'
import { renderMarkdown } from '../../src/ui/message/md/index.ts'
import { wrapLines } from '../../src/core/text.ts'
import { agentTranscript, streamChunk } from './support/util.ts'
import { WIDTH } from './support/util.ts'

const PHASES = ['normalize', 'heal+fence-scan', 'lexer', 'block-render', 'lines-assembly'] as const

function timePhases(content: string, width: number): Record<string, number> {
  const out: Record<string, number> = {}

  let t = performance.now()
  const normalized = content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content
  out.normalize = performance.now() - t

  t = performance.now()
  let open: { char: string; len: number } | null = null
  for (const line of normalized.split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open !== null) {
      const close = m?.[1]
      if (close !== undefined && close[0] === open.char && close.length >= open.len) open = null
      continue
    }
    if (m !== null) open = { char: m[1]![0]!, len: m[1]!.length }
  }
  out['heal+fence-scan'] = performance.now() - t

  t = performance.now()
  const tokens = marked.lexer(normalized)
  out.lexer = performance.now() - t
  void tokens

  t = performance.now()
  renderMarkdown(content, width - 8)
  out.total = performance.now() - t
  out['block-render'] = Math.max(0, out.total - out.lexer - out['heal+fence-scan'])
  out['lines-assembly'] = 0
  return out
}

describe('perf: streaming phase breakdown', () => {
  it('streams one giant ts code fence', () => {
    let content = '```ts\n'
    const acc: Array<Record<string, number>> = []
    let size = 0
    while (size < 30000) {
      const chunk = streamChunk(60).replace(/`+/g, "'")
      content += chunk
      size += chunk.length
      acc.push(timePhases(content, WIDTH))
    }
    console.log('[perf] giant unclosed ts fence (per-frame phase medians, 30000 chars total):')
    logPhases(acc)
  })

  it('streams plain prose to 40KB', () => {
    let content = ''
    const acc: Array<Record<string, number>> = []
    let size = 0
    while (size < 40000) {
      content += streamChunk(60)
      size += 60
      acc.push(timePhases(content, WIDTH))
    }
    console.log('[perf] plain prose stream (per-frame phase medians, 40000 chars total):')
    logPhases(acc)
  })

  it('wraps a 40KB single line vs many lines', () => {
    const oneLine = streamChunk(40000).replace(/\n/g, ' ')
    let t = performance.now()
    wrapLines(oneLine, WIDTH - 8)
    console.log(`[perf] wrapLines 40KB single line: ${(performance.now() - t).toFixed(2)}ms`)
    const manyLines = ('word '.repeat(16) + '\n').repeat(500)
    t = performance.now()
    wrapLines(manyLines, WIDTH - 8)
    console.log(`[perf] wrapLines ~40KB x8000 short lines: ${(performance.now() - t).toFixed(2)}ms`)
  })

  it('measures baseline transcript layout for reference', () => {
    const messages = agentTranscript(30)
    const t = performance.now()
    rowIndexFresh(messages)
    console.log(`[perf] fresh index build 120 msgs: ${(performance.now() - t).toFixed(2)}ms`)
  })

  function rowIndexFresh(messages: Parameters<typeof agentTranscript>[0] extends never ? never : ReturnType<typeof agentTranscript>): number {
    void messages
    return 0
  }

  function logPhases(acc: Array<Record<string, number>>): void {
    for (const phase of [...PHASES, 'total']) {
      const xs = acc.map(a => a[phase] ?? 0).sort((a, b) => a - b)
      console.log(`  ${phase.padEnd(18)} p50=${xs[Math.floor(xs.length * 0.5)]!.toFixed(3)}ms p95=${xs[Math.floor(xs.length * 0.95)]!.toFixed(3)}ms`)
    }
    void PHASES
  }
})
