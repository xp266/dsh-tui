import chalk from 'chalk'
import { env } from '../env.ts'
import type { ProbeReport } from './probe.ts'

export type ColorLevel = 0 | 1 | 2 | 3

function parseForcedColorLevel(value: string | undefined): ColorLevel | undefined {
  if (value === '0' || value === '1' || value === '2' || value === '3') return Number(value) as ColorLevel
  if (value === 'truecolor') return 3
  if (value === 'none' || value === 'false') return 0
  return undefined
}

function hasColorContract(): boolean {
  return env.color !== undefined
    || process.env.NO_COLOR !== undefined
    || process.env.FORCE_COLOR !== undefined
    || (process.env.TERM ?? '') === 'dumb'
}

function detectColorLevel(): ColorLevel {
  const forced = parseForcedColorLevel(env.color)
  if (forced !== undefined) return forced
  if (process.env.NO_COLOR !== undefined) return 0
  const forceColor = process.env.FORCE_COLOR
  if (forceColor !== undefined) {
    if (forceColor === 'false' || forceColor === '0') return 0
    if (forceColor === 'true' || forceColor === '') return 1
    const parsed = Number(forceColor)
    if (parsed === 1 || parsed === 2 || parsed === 3) return parsed
  }
  const term = process.env.TERM ?? ''
  if (term === 'dumb') return 0
  // ConPTY hosts (Windows Terminal, JetBrains, conhost) render 24-bit color
  // themselves; DCS probes never pass through, so the platform is the proof.
  if (process.platform === 'win32' && process.stdout.isTTY) return 3
  const colorterm = process.env.COLORTERM ?? ''
  if (colorterm === 'truecolor' || colorterm === '24bit') return 3
  if (term.includes('truecolor')) return 3
  if (process.env.WT_SESSION !== undefined) return 3
  if (term.includes('256color')) return 2
  // A live TTY without hints still speaks ANSI-16; 0 is for pipes and dumb.
  if (process.stdout.isTTY) return 1
  return 0
}

function detectUnicode(): boolean {
  if (env.ascii) return false
  if ((process.env.TERM ?? '') === 'dumb') return false
  const locale = process.env.LC_ALL ?? process.env.LANG ?? ''
  if (locale === '' || /utf-?8/i.test(locale)) return true
  const base = locale.split('.')[0] ?? locale
  if (base === 'C' || base === 'POSIX') return false
  return !locale.includes('.')
}

export let colorLevel: ColorLevel = detectColorLevel()

export function setColorLevel(level: ColorLevel): void {
  colorLevel = level
  chalk.level = level
}

/**
 * Merge probe answers over the heuristic baseline. Probes may only raise the
 * level — a missing DCS reply means "unproven", never "absent" — while the
 * explicit user contract (env.color / NO_COLOR / FORCE_COLOR / dumb) wins
 * over everything and skips probing entirely upstream.
 */
export function applyProbeReport(report: ProbeReport): void {
  if (report.colorLevel !== undefined && report.colorLevel > colorLevel) setColorLevel(report.colorLevel)
  if (report.terminal !== undefined) terminalName = report.terminal
  if (report.kittyKeyboard !== undefined) kittyKeyboard = report.kittyKeyboard
}

let terminalName: string | undefined

export function getTerminalName(): string | undefined {
  return terminalName
}

let kittyKeyboard = false

export function supportsKittyKeyboard(): boolean {
  return kittyKeyboard
}

chalk.level = colorLevel

export const unicode: boolean = detectUnicode()
