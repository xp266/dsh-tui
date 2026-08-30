import chalk from 'chalk'
import { COLORS } from '../../src/theme.ts'

chalk.level = 2

export function bgIndex(hex: string): number {
  const out = chalk.hex(hex)('x')
  return Number((out.match(/48;5;(\d+)/) ?? out.match(/38;5;(\d+)/))![1])
}

export function bg256(hex: string): string {
  return `\x1b[48;5;${bgIndex(hex)}m`
}

export const SELECTION_BG = bg256(COLORS.selectionBg)
export const DIALOG_BG = bg256(COLORS.dialogBackground)
export const SCROLL_TRACK_INDEX = bgIndex(COLORS.scrollTrackBackground)
export const SCROLL_THUMB_INDEX = bgIndex(COLORS.scrollThumbBackground)
