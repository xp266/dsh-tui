import { env } from '../env.ts'
import type { ThemeMode } from '../theme.ts'

function parseColorFgbg(): ThemeMode | undefined {
  const raw = process.env.COLORFGBG
  if (raw === undefined) return undefined
  const bg = Number(raw.split(';')[1])
  if (Number.isNaN(bg)) return undefined
  return bg === 7 || bg === 15 ? 'light' : 'dark'
}

/**
 * Precedence: explicit user setting, then the COLORFGBG contract, then the
 * OSC 11 answer carried by the startup probe burst, then dark. The probe
 * result is deliberately last — COLORFGBG is a terminal-side statement, and
 * tmux answers OSC 11 with pane colors that can disagree with the host.
 */
export function resolveBackgroundMode(probeBackground: ThemeMode | undefined): ThemeMode {
  if (env.background === 'dark' || env.background === 'light') return env.background
  const colorFgbg = parseColorFgbg()
  if (colorFgbg !== undefined) return colorFgbg
  return probeBackground ?? 'dark'
}
