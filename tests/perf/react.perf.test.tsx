import { describe, expect, it } from 'vitest'
import { mount, settle, listElement, statsOf, report } from './support/ink-harness.ts'
import type { Mount } from './support/ink-harness.ts'
import { agentTranscript, streamChunk, HEIGHT, WIDTH } from './support/util.ts'
import { rowIndexFor } from '../../src/ui/message/layout.ts'

describe('perf: react tier (production ink path)', () => {
  it('idle identical rerender = spinner-tick cost floor', async () => {
    for (const turns of [30, 150, 500]) {
      const messages = agentTranscript(turns)
      const top = Math.max(0, rowIndexFor(messages, WIDTH).total - HEIGHT)
      const { app }: Mount = await mount({ messages, scrollTop: top })
      const samples: number[] = []
      for (let i = 0; i < 120; i++) {
        const t0 = performance.now()
        app.rerender(listElement({ messages, scrollTop: top }))
        await settle()
        samples.push(performance.now() - t0)
      }
      console.log(report(`idle rerender x120, ${turns} turns`, statsOf(samples)))
      app.unmount()
    }
    expect(true).toBe(true)
  })

  it('page + fine scrolling across a large transcript', async () => {
    const messages = agentTranscript(150)
    const total = rowIndexFor(messages, WIDTH).total
    let top = Math.max(0, total - HEIGHT)
    const { app } = await mount({ messages, scrollTop: top })
    const pageSamples: number[] = []
    while (top > 0) {
      top = Math.max(0, top - (HEIGHT - 2))
      const t0 = performance.now()
      app.rerender(listElement({ messages, scrollTop: top }))
      await settle()
      pageSamples.push(performance.now() - t0)
    }
    console.log(report(`page-scroll up x${pageSamples.length} (${messages.length} msgs/${total} rows)`, statsOf(pageSamples)))

    const stride = Math.max(1, Math.floor(total / 150))
    const fineSamples: number[] = []
    while (top < total - HEIGHT) {
      top = Math.min(total - HEIGHT, top + stride)
      const t0 = performance.now()
      app.rerender(listElement({ messages, scrollTop: top }))
      await settle()
      fineSamples.push(performance.now() - t0)
    }
    console.log(report(`fine-scroll down stride=${stride} x${fineSamples.length}`, statsOf(fineSamples)))
    app.unmount()
    expect(statsOf(pageSamples).p95).toBeLessThan(16)
  })

  it('streaming end-to-end frames at 20 chars/frame', async () => {
    const messages = [...agentTranscript(30)]
    const id = 'stream-target'
    messages.push({ kind: 'bubble', id, role: 'assistant', content: '' })
    let content = ''
    let top = Math.max(0, rowIndexFor(messages, WIDTH).total - HEIGHT)
    const { app } = await mount({ messages, scrollTop: top })
    const samples: number[] = []
    const visible = [...messages]
    for (let f = 0; f < 700; f++) {
      const t0 = performance.now()
      content += streamChunk(20)
      const idx = visible.findIndex(m => m.id === id)
      visible[idx] = { kind: 'bubble', id, role: 'assistant', content }
      const shown = [...visible]
      top = Math.max(0, rowIndexFor(shown, WIDTH).total - HEIGHT)
      app.rerender(listElement({ messages: shown, scrollTop: top }))
      await settle()
      samples.push(performance.now() - t0)
    }
    console.log(report(`stream 20c/frame x${samples.length} final=${(content.length / 1024).toFixed(1)}KB`, statsOf(samples)))
    app.unmount()
    expect(statsOf(samples).p95).toBeLessThan(33)
  })

  it('streaming a very long message (40KB+) end-to-end', async () => {
    const messages = [...agentTranscript(10)]
    const id = 'stream-target'
    messages.push({ kind: 'bubble', id, role: 'assistant', content: '' })
    let content = ''
    let top = Math.max(0, rowIndexFor(messages, WIDTH).total - HEIGHT)
    const { app } = await mount({ messages, scrollTop: top })
    const samples: number[] = []
    const visible = [...messages]
    while (content.length < 45000) {
      const t0 = performance.now()
      content += streamChunk(60)
      const idx = visible.findIndex(m => m.id === id)
      visible[idx] = { kind: 'bubble', id, role: 'assistant', content }
      const shown = [...visible]
      top = Math.max(0, rowIndexFor(shown, WIDTH).total - HEIGHT)
      app.rerender(listElement({ messages: shown, scrollTop: top }))
      await settle()
      samples.push(performance.now() - t0)
    }
    console.log(report(`stream to 44KB x${samples.length}`, statsOf(samples)))
    app.unmount()
  })

  it('scrolling while streaming (worst case)', async () => {
    const messages = [...agentTranscript(100)]
    const id = 'stream-target'
    messages.push({ kind: 'bubble', id, role: 'assistant', content: '' })
    const total = rowIndexFor(messages, WIDTH).total
    let top = total - HEIGHT
    let direction = -1
    const { app } = await mount({ messages, scrollTop: top })
    const samples: number[] = []
    let content = ''
    const visible = [...messages]
    for (let f = 0; f < 240; f++) {
      content += streamChunk(30)
      const idx = visible.findIndex(m => m.id === id)
      visible[idx] = { kind: 'bubble', id, role: 'assistant', content }
      if (top <= 0 || top >= total - HEIGHT) direction *= -1
      top = Math.max(0, Math.min(total - HEIGHT, top + direction * HEIGHT))
      const t0 = performance.now()
      const shown = [...visible]
      app.rerender(listElement({ messages: shown, scrollTop: top }))
      await settle()
      samples.push(performance.now() - t0)
    }
    console.log(report(`scroll-during-stream x${samples.length}`, statsOf(samples)))
    app.unmount()
  })
})
