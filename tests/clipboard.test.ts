import { describe, expect, it } from 'vitest'
import { writeOsc52, readClipboardText } from '../src/terminal/clipboard.ts'

describe('clipboard write encoding', () => {
  it('osc52 payload decodes back to the original utf8 text', () => {
    const text = '1. 提问工具测试：\nsecond line'
    const frames: string[] = []
    const original = process.stdout.write.bind(process.stdout)
    ;(process.stdout as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => {
      frames.push(chunk)
      return true
    }
    try {
      writeOsc52(text)
    } finally {
      ;(process.stdout as unknown as { write: (chunk: string) => boolean }).write = original
    }
    const osc = frames.join('')
    const match = /\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/.exec(osc)
    expect(match).not.toBeNull()
    expect(Buffer.from(match![1]!, 'base64').toString('utf8')).toBe(text)
  })

  it('readClipboardText strips bom contamination from any backend', async () => {
    const { registerClipboardBackend } = await import('../src/terminal/clipboard-backends.ts')
    const dispose = registerClipboardBackend({ id: 'test-bom', readText: () => '\ufeffresult \ufefftext' })
    try {
      await expect(readClipboardText()).resolves.toBe('result text')
    } finally {
      dispose()
    }
  })
})
