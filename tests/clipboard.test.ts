import { describe, expect, it } from 'vitest'
import { writeOsc52, clipExeInput } from '../src/terminal/clipboard.ts'

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

  it('clip.exe input is utf16le with a bom so gbk codepages cannot corrupt it', () => {
    const text = '1. 提问工具测试：'
    const buffer = clipExeInput(text)
    expect(buffer[0]).toBe(0xff)
    expect(buffer[1]).toBe(0xfe)
    expect(buffer.toString('utf16le').slice(1)).toBe(text)
  })
})
