import { computeWrapStarts, segmentGraphemes } from './text.ts'

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
  let line: Array<{ cluster: string; style: MarkStyle }> = []
  const flushLine = (): void => {
    const clusters = line.map(cell => cell.cluster)
    const starts = computeWrapStarts(clusters, width)
    for (let r = 0; r < starts.length; r++) {
      const from = starts[r]!
      const to = r + 1 < starts.length ? starts[r + 1]! : line.length
      const row: Segment[] = []
      for (let k = from; k < to; k++) row.push({ text: line[k]!.cluster, style: line[k]!.style })
      rows.push(mergeRuns(row))
    }
    line = []
  }
  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) flushLine()
      for (const { segment } of segmentGraphemes(parts[p]!)) {
        line.push({ cluster: segment, style: seg.style })
      }
    }
  }
  flushLine()
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
