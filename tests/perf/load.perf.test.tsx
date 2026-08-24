import { describe, expect, it } from 'vitest'
import { mount, settle, listElement } from './support/ink-harness.ts'
import { rowIndexFor } from '../../src/ui/message/layout.ts'
import { agentTranscript, HEIGHT, WIDTH } from './support/util.ts'

describe('perf: session hydration', () => {
  it('first paint of transcripts of increasing size', async () => {
    for (const turns of [10, 40, 120]) {
      globalThis.gc?.()
      const messages = agentTranscript(turns)

      const tIndex0 = performance.now()
      rowIndexFor(messages, WIDTH)
      const indexMs = performance.now() - tIndex0

      const t0 = performance.now()
      const { app } = await mount({ messages, scrollTop: 0 })
      const mountMs = performance.now() - t0
      app.unmount()
      console.log(`[perf] hydrate ${turns} turns (${messages.length} msgs): coldIndex=${indexMs.toFixed(1)}ms mount=${mountMs.toFixed(1)}ms`)
    }
    expect(true).toBe(true)
  })

  it('re-mount cost (session switch path)', async () => {
    const messages = agentTranscript(120)
    for (let round = 0; round < 3; round++) {
      const t0 = performance.now()
      const { app } = await mount({ messages, scrollTop: 0 })
      await settle()
      const ms = performance.now() - t0
      app.unmount()
      console.log(`[perf] remount round ${round + 1}: ${ms.toFixed(1)}ms`)
    }
    expect(true).toBe(true)
  })
})
