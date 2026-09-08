import type { ColorLevel } from './capabilities.ts'
import type { ThemeMode } from '../theme.ts'
import { writeStdoutRaw } from './modes.ts'

export interface ProbeReport {
  colorLevel?: ColorLevel
  background?: ThemeMode
  terminal?: string
  kittyKeyboard?: boolean
}

/**
 * One raw-mode round trip asks for every capability at once and ends with a
 * cursor position report: any terminal that replies at all answers CPR, so
 * it doubles as the "all replies have arrived" sentinel — no per-feature
 * timeouts. The window also drains stale console input queued before
 * startup (ConPTY keeps mouse and key events that predate raw mode).
 */
const BURST = '\x1b[0m\x1b[38;2;250;251;252m\x1bP$qm\x1b\\\x1b[0m\x1b[>0q\x1b[c\x1b[?u\x1b]11;?\x1b\\\x1b[6n'
// tmux answers DCS queries itself and never forwards them to the outer
// terminal, so identity and SGR echo are skipped there; TERM/COLORTERM hints
// carry the color decision instead.
const BURST_TMUX = '\x1b[c\x1b[?u\x1b]11;?\x1b\\\x1b[6n'
const BURST_TIMEOUT_MS = 2000

const XTVERSION_RESPONSE = /\x1bP>\|([^\x1b]*)\x1b\\/
const KITTY_KEYBOARD_RESPONSE = /\x1b\[\?(\d+)u/
const CPR_SENTINEL = /\x1b\[\d+;\d+R/
const OSC11_RESPONSE = /\x1b]11;rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})(?:\x07|\x1b\\)/

const SGR_PROBE_RESPONSE = /\x1bP(\d)\$r(.*?)(?:\x1b\\|\x07)/s

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

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function parseOsc11Background(raw: string): ThemeMode | undefined {
  const match = OSC11_RESPONSE.exec(raw)
  if (match === null) return undefined
  const channel = (hex: string): number => parseInt(hex, 16) / (16 ** hex.length - 1)
  const bright = luminance(channel(match[1]!), channel(match[2]!), channel(match[3]!)) > 0.5
  return bright ? 'light' : 'dark'
}

export function probeTerminal(): Promise<ProbeReport> {
  return new Promise(resolve => {
    const stdin = process.stdin
    if ((process.env.TERM ?? '') === 'dumb' || !stdin.isTTY || !process.stdout.isTTY || stdin.setRawMode === undefined) {
      resolve({})
      return
    }
    const report: ProbeReport = {}
    let buffer = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      stdin.off('data', onData)
      try {
        stdin.setRawMode(false)
      } catch {
        // The stream may have closed while the probe was in flight; nothing to restore.
      }
      resolve(report)
    }
    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const xtversion = XTVERSION_RESPONSE.exec(buffer)
      if (xtversion !== null && report.terminal === undefined) report.terminal = xtversion[1]!.trim()
      if (report.colorLevel === undefined) {
        const parsed = parseSgrProbe(buffer)
        if (parsed !== undefined) report.colorLevel = parsed
      }
      if (report.kittyKeyboard === undefined && KITTY_KEYBOARD_RESPONSE.test(buffer)) report.kittyKeyboard = true
      if (report.background === undefined) report.background = parseOsc11Background(buffer)
      if (CPR_SENTINEL.test(buffer)) settle()
    }
    try {
      stdin.setRawMode(true)
    } catch {
      // Raw mode is unavailable (piped stdin or non-TTY); the probe quietly gives up.
      resolve({})
      return
    }
    stdin.on('data', onData)
    writeStdoutRaw(process.env.TMUX !== undefined ? BURST_TMUX : BURST)
    timer = setTimeout(settle, BURST_TIMEOUT_MS)
  })
}
