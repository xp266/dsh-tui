import chalk from 'chalk'
import { env } from '../env.ts'

export type ColorLevel = 0 | 1 | 2 | 3

function parseForcedColorLevel(value: string | undefined): ColorLevel | undefined {
  if (value === '0' || value === '1' || value === '2' || value === '3') return Number(value) as ColorLevel
  if (value === 'truecolor') return 3
  if (value === 'none' || value === 'false') return 0
  return undefined
}

function fallbackColorLevel(): ColorLevel {
  const term = process.env.TERM ?? ''
  if (term === 'dumb') return 0
  const colorterm = process.env.COLORTERM ?? ''
  if (colorterm === 'truecolor' || colorterm === '24bit') return 3
  if (term.includes('truecolor')) return 3
  if (process.env.WT_SESSION !== undefined) return 3
  if (term.includes('256color')) return 2
  if (term !== '' || process.env.TERM_PROGRAM !== undefined) return 1
  return process.stdout.isTTY ? 1 : 0
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
  return fallbackColorLevel()
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

chalk.level = colorLevel

export const unicode: boolean = detectUnicode()
