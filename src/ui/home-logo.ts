import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { useMemo, useSyncExternalStore } from 'react'
import { installedUpstreamLines } from '../contract/upstream.ts'
import { BUBBLE_WIDTH_OFFSET } from '../core/metrics.ts'
import type { HomeLogoMessage } from '../model/message.ts'
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

const HOME_LOGO_ID = 'home-logo'

/**
 * The home page presents its content in chat-page style: the logo artwork is
 * the first bubble, left-aligned with a transparent background, followed by
 * version banner lines inside the same bubble. `width` is the full list
 * width and `height` the visible viewport; when either cannot hold the
 * artwork, only the artwork lines are culled and the bubble stays.
 */
export function useHomeLogoBubble(width: number, height: number): HomeLogoMessage {
  const logo = useHomeLogo()
  return useMemo(() => homeLogoBubble(logo, width, height), [logo, width, height])
}

function homeLogoBubble(logo: HomeLogoContribution | undefined, width: number, height: number): HomeLogoMessage {
  const clean = logo?.lines.map(line => line.trimEnd()) ?? []
  const metrics = homeLogoMetrics(clean)
  const fits = clean.length > 0 && width - BUBBLE_WIDTH_OFFSET >= metrics.columns && height >= metrics.rows
  return {
    kind: 'home-logo',
    id: HOME_LOGO_ID,
    lines: fits ? clean : [],
    colors: fits ? homeLogoLineColors(clean, COLORS.homeLogoTop, COLORS.homeLogoBottom) : [],
    info: [dshVersionLine(), `dshtui ${tuiVersion()}`],
  }
}

function dshVersionLine(): string {
  // dsh-agent itself does not export ./package.json, so the version comes
  // from the lockstepped harness line any sibling package exposes.
  return `dsh ${installedUpstreamLines()[0] ?? 'unknown'}`
}

let cachedTuiVersion: string | undefined

function tuiVersion(): string {
  if (cachedTuiVersion !== undefined) return cachedTuiVersion
  try {
    const path = fileURLToPath(import.meta.resolve('@xp266/dshtui/package.json'))
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: string }
    cachedTuiVersion = manifest.version ?? 'unknown'
  } catch {
    // The manifest may be unreadable in unusual install layouts; the bubble still renders.
    cachedTuiVersion = 'unknown'
  }
  return cachedTuiVersion
}