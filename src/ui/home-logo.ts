import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { useSyncExternalStore } from 'react'
import { installedUpstreamLines } from '../contract/upstream.ts'
import { keyedRegistry } from '../kernel/registry.ts'
import { textWidth } from '../core/text.ts'
import { COLORS } from '../theme.ts'

export interface HomeLogoContribution {
  id: string
  order?: number
  /** Logo artwork, one string per terminal row. */
  lines: readonly string[]
}

const BUILTIN_LOGO_LINES = [
  '▀█▀▀▄                   ▄▀▀▀▄             ▀█',
  ' █  █ ▄▀▀▀▄ ▄▀▀▀▄ ▀█▀▀▄ ▀▄▄▄  ▄▀▀▀▄ ▄▀▀▀▄  █ ▄▀',
  ' █  █ █▀▀▀▀ █▀▀▀▀  █▄▄▀ ▄   █ █▀▀▀▀ █▀▀▀▀  █▀▄',
  '▀▀▀▀   ▀▀▀   ▀▀▀   █     ▀▀▀   ▀▀▀   ▀▀▀  ▀▀  ▀',
  '█   █             ▀▀▀',
  '█▄▄▄█ ▀▀▀▄  ▀█▄▀▄ █▄▀▀▄ ▄▀▀▀▄ ▄▀▀▀ ▄▀▀▀',
  '█   █ ▄▀▀█   █  ▀ █   █ █▀▀▀▀  ▀▀▄  ▀▀▄',
  '▀   ▀  ▀▀ ▀ ▀▀▀   ▀   ▀  ▀▀▀  ▀▀▀  ▀▀▀',
]

const SLOT = 'home-logo'
const HOME_LOGO_BUILTIN_ORDER = 1000
const registry = keyedRegistry<HomeLogoContribution>()

registry.register(SLOT, { id: 'builtin', order: HOME_LOGO_BUILTIN_ORDER, lines: BUILTIN_LOGO_LINES }, { order: HOME_LOGO_BUILTIN_ORDER })

export function registerHomeLogo(contribution: HomeLogoContribution): () => void {
  return registry.register(SLOT, contribution, { order: contribution.order })
}

export function currentHomeLogo(): HomeLogoContribution | undefined {
  return registry.get(SLOT)
}

export function subscribeHomeLogo(listener: () => void): () => void {
  return registry.subscribe(listener)
}

export function useHomeLogo(): HomeLogoContribution | undefined {
  return useSyncExternalStore(subscribeHomeLogo, currentHomeLogo, currentHomeLogo)
}

/** Mix two hex colors linearly; t=0 keeps `from`, t=1 keeps `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const mix = (at: number): string => {
    const a = parseInt(from.slice(at, at + 2), 16)
    const b = parseInt(to.slice(at, at + 2), 16)
    return Math.round(a + (b - a) * clamp).toString(16).padStart(2, '0')
  }
  return `#${mix(1)}${mix(3)}${mix(5)}`
}

export interface HomeLogoMetrics {
  rows: number
  columns: number
}

/** Trimmed display extent of the artwork; used for the small-terminal guard. */
export function homeLogoMetrics(lines: readonly string[]): HomeLogoMetrics {
  let columns = 0
  for (const raw of lines) {
    const width = textWidth(raw.trimEnd())
    if (width > columns) columns = width
  }
  return { rows: lines.length, columns }
}

/** One color per artwork row, graded from `top` to `bottom`. */
export function homeLogoLineColors(lines: readonly string[], top: string, bottom: string): string[] {
  const count = lines.length
  if (count === 0) return []
  if (count === 1) return [top]
  const step = 1 / (count - 1)
  return lines.map((_, i) => mixHex(top, bottom, i * step))
}

const BLOCK_GLYPHS = new Set(['█', '▀', '▄', ' '])

/**
 * Displace pure block-glyph artwork down by half a cell: every cell's
 * top/bottom half ink moves one pixel-row down and is re-encoded as
 * ▀/▄/█. The shape is pixel-identical, but the artwork's bottom edge lands
 * on a cell boundary, so vertically centered text beside it reads as
 * aligned with the bottom line. Artwork containing any non-block glyph is
 * returned unchanged — text glyphs cannot be split across cells.
 */
export function shiftLogoDownHalfRow(lines: readonly string[]): string[] {
  const width = lines.reduce((max, line) => Math.max(max, line.length), 0)
  if (width === 0) return [...lines]
  for (const line of lines) {
    for (const ch of line) {
      if (!BLOCK_GLYPHS.has(ch)) return [...lines]
    }
  }
  const top: boolean[][] = lines.map(line => Array.from({ length: width }, (_, c) => line[c] === '█' || line[c] === '▀'))
  const bottom: boolean[][] = lines.map(line => Array.from({ length: width }, (_, c) => line[c] === '█' || line[c] === '▄'))
  const rows: string[] = []
  for (let r = 0; r <= lines.length; r++) {
    let row = ''
    let ink = false
    for (let c = 0; c < width; c++) {
      const t = r > 0 && bottom[r - 1]![c]!
      const b = r < lines.length && top[r]![c]!
      row += t && b ? '█' : t ? '▀' : b ? '▄' : ' '
      ink = ink || t || b
    }
    if (ink) rows.push(row.trimEnd())
  }
  return rows
}

/** The running harness version, `dsh <version>`. */
export function dshVersionLine(): string {
  // dsh-agent itself does not export ./package.json, so the version comes
  // from the lockstepped harness line any sibling package exposes.
  return `dsh ${installedUpstreamLines()[0] ?? 'unknown'}`
}

let cachedTuiVersion: string | undefined

export function tuiVersion(): string {
  if (cachedTuiVersion !== undefined) return cachedTuiVersion
  try {
    const path = fileURLToPath(import.meta.resolve('@xp266/dshtui/package.json'))
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: string }
    cachedTuiVersion = manifest.version ?? 'unknown'
  } catch {
    // The manifest may be unreadable in unusual install layouts; the label still renders.
    cachedTuiVersion = 'unknown'
  }
  return cachedTuiVersion
}