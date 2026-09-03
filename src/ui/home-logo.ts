import { useSyncExternalStore } from 'react'
import { keyedRegistry } from '../kernel/registry.ts'
import { textWidth } from '../core/text.ts'

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