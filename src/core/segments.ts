import { charWidth, segmentGraphemes } from './text.ts'

export interface MarkStyle {
  color?: string
  bold?: boolean
  italic?: boolean
}

export interface Segment {
  text: string
  style: MarkStyle
}

export function wrapSegments(segments: Segment[], width: number): Segment[][] {
  if (width <= 0) return [[]]
  const rows: Segment[][] = []
  let current: Segment[] = []
  let currentWidth = 0
  const flush = () => {
    rows.push(mergeRuns(current))
    current = []
    currentWidth = 0
  }
  const pushCluster = (cluster: string, style: MarkStyle) => {
    if (cluster === '\n') {
      flush()
      return
    }
    const w = charWidth(cluster)
    if (currentWidth + w > width) flush()
    current.push({ text: cluster, style })
    currentWidth += w
  }
  const charLoop = (text: string, style: MarkStyle) => {
    for (const { segment } of segmentGraphemes(text)) {
      pushCluster(segment, style)
    }
  }
  for (const seg of segments) {
    const text = seg.text
    if (text === '') continue
    if (text.indexOf('\n') >= 0) {
      charLoop(text, seg.style)
      continue
    }
    let total = 0
    let fits = true
    for (const { segment } of segmentGraphemes(text)) {
      const w = charWidth(segment)
      if (currentWidth + total + w > width) {
        fits = false
        break
      }
      total += w
    }
    if (fits) {
      current.push({ text, style: seg.style })
      currentWidth += total
      continue
    }
    charLoop(text, seg.style)
  }
  rows.push(mergeRuns(current))
  return rows
}

export function mergeRuns(segments: Segment[]): Segment[] {
  if (segments.length === 0) return segments
  const out: Segment[] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last !== undefined && last.style.color === seg.style.color && last.style.bold === seg.style.bold) {
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
    key += `${seg.text.length}:${seg.text}\x1f${seg.style.color ?? ''}\x1e${seg.style.bold ? 'b' : ''}${seg.style.italic ? 'i' : ''}\x1d`
  }
  return key
}
