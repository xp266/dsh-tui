import { env } from '../env.ts'
import type { ColorLevel } from './capabilities.ts'

const SGR_PROBE_QUERY = '\x1b[0m\x1b[38;2;250;251;252m\x1bP$qm\x1b\\\x1b[c'
const SGR_PROBE_RESPONSE = /\x1bP(\d)\$r(.*?)(?:\x1b\\|\x07)/s
const SGR_PROBE_REJECTED = /\x1bP0\$r/
const PROBE_TIMEOUT_MS = 250

export function parseSgrProbe(raw: string): ColorLevel | undefined {
  const response = SGR_PROBE_RESPONSE.exec(raw)
  if (response === null || response[1] !== '1') return undefined
  const tokens = response[2].replace(/[m\s]/g, '').split(/[;:]/)
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] !== '38') continue
    if (tokens[i + 1] === '2') return 3
    if (tokens[i + 1] === '5') return 2
  }
  return 1
}

export function probeColorLevel(): Promise<ColorLevel | undefined> {
  return new Promise(resolve => {
    if (env.color !== undefined || process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR !== undefined || (process.env.TERM ?? '') === 'dumb') {
      resolve(undefined)
      return
    }
    const stdin = process.stdin
    if (!stdin.isTTY || !process.stdout.isTTY || stdin.setRawMode === undefined) {
      resolve(undefined)
      return
    }
    let buffer = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: ColorLevel | undefined): void => {
      if (timer !== undefined) clearTimeout(timer)
      stdin.off('data', onData)
      try {
        stdin.setRawMode(false)
      } catch {}
      process.stdout.write('\x1b[0m')
      resolve(result)
    }
    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const parsed = parseSgrProbe(buffer)
      if (parsed !== undefined || SGR_PROBE_REJECTED.test(buffer)) finish(parsed)
    }
    try {
      stdin.setRawMode(true)
    } catch {
      resolve(undefined)
      return
    }
    stdin.on('data', onData)
    process.stdout.write(SGR_PROBE_QUERY)
    timer = setTimeout(() => finish(undefined), PROBE_TIMEOUT_MS)
  })
}
