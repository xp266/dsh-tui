import { computeWrapStarts, segmentGraphemes } from './text.ts'

export interface MarkStyle {
  color?: string
  background?: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  underline?: boolean
}

export interface Segment {
  text: string
  style: MarkStyle
}

export function wrapSegments(segments: Segment[], width: number): Segment[][] {
  if (width <= 0) return [[]]
  const rows: Segment[][] = []
  let clusters: string[] = []
  let styles: MarkStyle[] = []
  const flushLine = (): void => {
    const starts = computeWrapStarts(clusters, width)
    for (let r = 0; r < starts.length; r++) {
      const from = starts[r]!
      const to = r + 1 < starts.length ? starts[r + 1]! : clusters.length
      if (from >= to) {
        rows.push([])
        continue
      }
      const row: Segment[] = []
      let runText = ''
      let runStyle = styles[from]!
      for (let k = from; k < to; k++) {
        const style = styles[k]!
        if (k > from && !sameStyle(runStyle, style)) {
          row.push({ text: runText, style: runStyle })
          runText = ''
          runStyle = style
        }
        runText += clusters[k]
      }
      row.push({ text: runText, style: runStyle })
      rows.push(row)
    }
    clusters = []
    styles = []
  }
  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) flushLine()
      appendClusters(parts[p]!, seg.style, clusters, styles)
    }
  }
  flushLine()
  return rows
}

function sameStyle(a: MarkStyle, b: MarkStyle): boolean {
  return a.color === b.color
    && a.background === b.background
    && a.bold === b.bold
    && a.italic === b.italic
    && a.strike === b.strike
    && a.underline === b.underline
}

function appendClusters(text: string, style: MarkStyle, clusters: string[], styles: MarkStyle[]): void {
  let ascii = true
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) {
      ascii = false
      break
    }
  }
  if (ascii) {
    for (let i = 0; i < text.length; i++) {
      clusters.push(text[i]!)
      styles.push(style)
    }
    return
  }
  for (const { segment } of segmentGraphemes(text)) {
    clusters.push(segment)
    styles.push(style)
  }
}

export function mergeRuns(segments: Segment[]): Segment[] {
  if (segments.length === 0) return segments
  const out: Segment[] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last !== undefined && sameStyle(last.style, seg.style)) {
      last.text += seg.text
    } else {
      out.push({ text: seg.text, style: seg.style })
    }
  }
  return out
}

export function segmentsKey(segments: Segment[]): string {
  let key = ''
  for (const seg of segments) {
    const flags = `${seg.style.bold ? 'b' : ''}${seg.style.italic ? 'i' : ''}${seg.style.strike ? 's' : ''}${seg.style.underline ? 'u' : ''}${seg.style.background ? 'g' : ''}`
    key += `${seg.text.length}:${seg.text}\x1f${seg.style.color ?? ''}\x1e${seg.style.background ?? ''}\x1e${flags}\x1d`
  }
  return key
}
