import { colorLevel } from './capabilities.ts'
import { env } from '../env.ts'
import type { ThemeMode } from '../theme.ts'

const OSC11_QUERY = '\x1b]11;?\x1b\\'
const OSC11_RESPONSE = /\x1b]11;rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})(?:\x07|\x1b\\)/
const OSC11_TIMEOUT_MS = 250

function parseColorFgbg(): ThemeMode | undefined {
  const raw = process.env.COLORFGBG
  if (raw === undefined) return undefined
  const bg = Number(raw.split(';')[1])
  if (Number.isNaN(bg)) return undefined
  return bg === 7 || bg === 15 ? 'light' : 'dark'
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function queryOsc11Background(): Promise<ThemeMode | undefined> {
  return new Promise(resolve => {
    const stdin = process.stdin
    if (colorLevel === 0 || !stdin.isTTY || !process.stdout.isTTY || stdin.setRawMode === undefined) {
      resolve(undefined)
      return
    }
    let buffer = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: ThemeMode | undefined): void => {
      if (timer !== undefined) clearTimeout(timer)
      stdin.off('data', onData)
      try {
        stdin.setRawMode(false)
      } catch {}
      resolve(result)
    }
    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const match = OSC11_RESPONSE.exec(buffer)
      if (match === null) return
      const channel = (hex: string): number => parseInt(hex, 16) / (16 ** hex.length - 1)
      const bright = luminance(channel(match[1]), channel(match[2]), channel(match[3])) > 0.5
      finish(bright ? 'light' : 'dark')
    }
    try {
      stdin.setRawMode(true)
    } catch {
      resolve(undefined)
      return
    }
    stdin.on('data', onData)
    process.stdout.write(OSC11_QUERY)
    timer = setTimeout(() => finish(undefined), OSC11_TIMEOUT_MS)
  })
}

export async function detectBackgroundMode(): Promise<ThemeMode> {
  if (env.background === 'dark' || env.background === 'light') return env.background
  const colorFgbg = parseColorFgbg()
  if (colorFgbg !== undefined) return colorFgbg
  return (await queryOsc11Background()) ?? 'dark'
}
