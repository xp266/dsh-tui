import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { initialTurnState, reduceChatEvent } from '../../src/chat/store.ts'
import { rowIndexFor } from '../../src/ui/message/layout.ts'
import { renderMarkdown } from '../../src/ui/message/md/index.ts'
import type { Message } from '../../src/model/message.ts'
import {
  FrameRecorder,
  WIDTH,
  HEIGHT,
  agentTranscript,
  fmtStats,
  mdParagraph,
  streamChunk,
} from './support/util.ts'

interface SimOptions {
  transcript: Message[]
  chunkChars: number
  frames: number
  width?: number
}

function simulateStreaming({ transcript, chunkChars, frames, width = WIDTH }: SimOptions): {
  total: FrameRecorder
  reduce: FrameRecorder
  layout: FrameRecorder
} {
  const messages: Message[] = [...transcript]
  let turn = initialTurnState()
  const step = 999
  const recTotal = new FrameRecorder()
  const recReduce = new FrameRecorder()
  const recLayout = new FrameRecorder()

  for (let f = 0; f < frames; f++) {
    const t0 = performance.now()

    const tReduce0 = performance.now()
    let dirty = false
    const events: SessionEvent[] = []
    if (!turn.assistantIds.has(step)) {
      events.push({
        type: 'assistant/chunk',
        data: { step, chunk: { type: 'text-delta', text: streamChunk(Math.max(1, Math.round(chunkChars / 3))) } },
      } as SessionEvent)
    }
    events.push({
      type: 'assistant/chunk',
      data: { step, chunk: { type: 'text-delta', text: streamChunk(chunkChars) } },
    } as SessionEvent)
    for (const event of events) {
      const next = reduceChatEvent(messages, event, turn)
      dirty = dirty || next.changed
      turn = next.turn
    }
    const tReduce1 = performance.now()

    const visible: Message[] = dirty ? [...messages] : messages
    const tLayout0 = performance.now()
    const index = rowIndexFor(visible, width)
    const maxScroll = Math.max(0, index.total - HEIGHT)
    for (let row = maxScroll; row < maxScroll + HEIGHT; row++) {
      const info = index.rowAt(row)
      if (info !== null && info.segKey !== undefined) info.text.length
    }
    const tLayout1 = performance.now()

    recReduce.record(tReduce1 - tReduce0)
    recLayout.record(tLayout1 - tLayout0)
    recTotal.record(performance.now() - t0)
  }
  return { total: recTotal, reduce: recReduce, layout: recLayout }
}

describe('perf: streaming pipeline', () => {
  it('streams into an existing transcript at realistic chunk rates', () => {
    const base = agentTranscript(30)

    console.log(fmtStats('stream small chunks (4 chars/frame, 300 frames)',
      simulateStreaming({ transcript: base, chunkChars: 4, frames: 300 }).total.stats))
    console.log(fmtStats('stream medium chunks (20 chars/frame, 400 frames)',
      simulateStreaming({ transcript: base, chunkChars: 20, frames: 400 }).total.stats))

    const big = simulateStreaming({ transcript: agentTranscript(120), chunkChars: 60, frames: 500 })
    console.log(fmtStats('stream large transcript x360 msgs (60 chars/frame, 500 frames)', big.total.stats))
    console.log(fmtStats('  reduce phase', big.reduce.stats))
    console.log(fmtStats('  layout phase', big.layout.stats))

    expect(big.total.stats.p95).toBeLessThan(16)
  })

  it('measures per-frame cost as the streamed message grows', () => {
    const recorder = new FrameRecorder()
    const buckets = new Map<string, number[]>()
    const bucketOf = (size: number): string =>
      size < 2000 ? '0-2KB' : size < 8000 ? '2-8KB' : size < 20000 ? '8-20KB' : size < 40000 ? '20-40KB' : '40KB+'

    let turn = initialTurnState()
    const messages: Message[] = agentTranscript(10)
    const step = 42
    for (let f = 0; f < 1400; f++) {
      const contentLen = (() => {
        const id = turn.assistantIds.get(step)
        const m = id === undefined ? undefined : messages.find(x => x.id === id)
        return m?.kind === 'bubble' ? m.content.length : 0
      })()
      const key = bucketOf(contentLen)
      const t0 = performance.now()
      const next = reduceChatEvent(messages, {
        type: 'assistant/chunk',
        data: { step, chunk: { type: 'text-delta', text: mdParagraph(f % 5).slice(0, 40) } },
      } as SessionEvent, turn)
      turn = next.turn
      rowIndexFor([...messages], WIDTH)
      const dt = performance.now() - t0
      recorder.record(dt)
      const list = buckets.get(key) ?? []
      list.push(dt)
      buckets.set(key, list)
      if (contentLen > 45000) break
    }
    console.log(`[perf] growth curve, streamed message buckets (frame=reduce+index copy):`)
    for (const [key, samples] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sorted = samples.slice().sort((a, b) => a - b)
      console.log(
        `  ${key.padEnd(8)} n=${String(samples.length).padStart(4)} p50=${sorted[Math.floor(sorted.length * 0.5)]!.toFixed(3)}ms p95=${sorted[Math.floor(sorted.length * 0.95)]!.toFixed(3)}ms max=${sorted[sorted.length - 1]!.toFixed(3)}ms`,
      )
    }
    console.log(fmtStats('growth overall', recorder.stats))
    expect(recorder.count).toBeGreaterThan(100)
  })

  it('measures markdown re-render of a growing message directly', () => {
    const widths = [WIDTH]
    for (const width of widths) {
      for (const targetSize of [2000, 8000, 20000, 40000]) {
        let content = ''
        let lastCost = 0
        while (content.length < targetSize) {
          content += mdParagraph(content.length % 7).slice(0, 64)
          const t0 = performance.now()
          renderMarkdown(content, width - 8)
          lastCost = performance.now() - t0
        }
        console.log(`[perf] full re-render @${((targetSize / 1024) | 0)}KB width=${width}: ${lastCost.toFixed(3)}ms`)
      }
    }
    expect(true).toBe(true)
  })
})
