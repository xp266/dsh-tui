import type { MarkStyle, Segment } from '../../core/segments.ts'

const WAVE_STEPS = 6
const LIGHTEN_SPAN = 0.6

interface Hsl {
  h: number
  s: number
  l: number
}

const palettes = new Map<string, string[]>()

export function wavePalette(base: string): string[] {
  const cached = palettes.get(base)
  if (cached !== undefined) return cached
  const parsed = hexToHsl(base)
  if (parsed === undefined) return [base]
  const palette: string[] = []
  for (let step = 0; step < WAVE_STEPS; step++) {
    const lightness = parsed.l + (1 - parsed.l) * ((step + 1) / WAVE_STEPS) * LIGHTEN_SPAN
    palette.push(hslToHex({ h: parsed.h, s: parsed.s, l: lightness }))
  }
  palettes.set(base, palette)
  return palette
}

/**
 * Comet wave: the lightest of the six palette colors leads at `head`, trailing
 * progressively darker colors behind it until they blend back into `rest`. The
 * band travels right one step per phase tick, fully exits past the last
 * character, shows one all-rest frame, then re-enters from the left.
 */
export function waveSegments(text: string, phase: number, palette: string[], rest: string, base: MarkStyle = {}): Segment[] {
  if (text === '' || palette.length === 0) return []
  const clusters = [...text]
  const cycle = clusters.length + WAVE_STEPS
  const head = ((phase % cycle) + cycle) % cycle
  const segments: Segment[] = []
  let runText = ''
  let runColor: string | undefined
  const flush = (): void => {
    if (runText === '' || runColor === undefined) return
    segments.push({ text: runText, style: { ...base, color: runColor } })
    runText = ''
  }
  for (let index = 0; index < clusters.length; index++) {
    const offset = head - index
    const color = offset >= 0 && offset < WAVE_STEPS ? palette[WAVE_STEPS - 1 - offset]! : rest
    if (runColor !== undefined && color !== runColor) {
      flush()
    }
    runColor = color
    runText += clusters[index]
  }
  flush()
  return segments
}

function hexToHsl(hex: string): Hsl | undefined {
  const match = /^#([\da-f]{6})$/i.exec(hex)
  if (match === null) return undefined
  const value = Number.parseInt(match[1]!, 16)
  const r = ((value >> 16) & 0xff) / 255
  const g = ((value >> 8) & 0xff) / 255
  const b = (value & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (channel: number): string => Math.round((channel + m) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
