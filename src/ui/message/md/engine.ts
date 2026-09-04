import { marked } from 'marked'
import type { Token } from 'marked'
import type { Segment } from '../../../core/segments.ts'
import { renderBlockRows } from './block.ts'
import type { BlockContext } from './block.ts'
import { createMdPalette } from './palette.ts'

export interface MarkdownRenderResult {
  rows: Segment[][]
  lines: string[]
}

export interface MarkdownRenderer {
  update(content: string): MarkdownRenderResult
}

function normalizeEol(content: string): string {
  return content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content
}

interface FenceScan {
  insideFence: boolean
}

interface FenceOpen {
  char: string
  len: number
}

/**
 * CommonMark fence rules: an opening fence's info string may not contain the
 * fence character (so "``` ```ts" is a paragraph, not a fence), and a closing
 * fence may carry only trailing whitespace. marked follows the same rules, so
 * the streaming scanner must too or its fence state diverges from the lexer.
 */
function fenceOpenOf(line: string): FenceOpen | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  if (match === null) return null
  const marker = match[1]!
  const info = match[2] ?? ''
  if (marker[0] === '`' && info.includes('`')) return null
  if (marker[0] === '~' && info.includes('~')) return null
  return { char: marker[0]!, len: marker.length }
}

function fenceCloseOf(line: string, open: FenceOpen): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
  if (match === null) return false
  const marker = match[1]!
  return marker[0] === open.char && marker.length >= open.len
}

function scanFences(content: string): FenceScan {
  let open: FenceOpen | null = null
  for (const line of content.split('\n')) {
    if (open !== null) {
      if (fenceCloseOf(line, open)) open = null
      continue
    }
    open = fenceOpenOf(line)
  }
  return { insideFence: open !== null }
}

function healInlineTail(content: string): string {
  if (content === '' || scanFences(content).insideFence) return content
  const breakAt = content.lastIndexOf('\n\n')
  const head = breakAt === -1 ? '' : content.slice(0, breakAt + 2)
  const tail = content.slice(head.length)
  let suffix = ''
  const matches = [...tail.matchAll(/(`+|~~|\*\*|__)/g)]
  if (matches.length > 0) {
    const last = matches[matches.length - 1]![1]!
    const count = matches.filter(match => match[1] === last).length
    if (count % 2 === 1) suffix = last
  }
  return suffix === '' ? content : head + tail + suffix
}

interface BlockEntry {
  rows: Segment[][]
  lines: string[]
  bytes: number
}

const BLOCK_CACHE_MAX = 512
// Rows retain one segment per styled run plus the joined plain line, so an
// entry for a large code block can reach megabytes; the byte cap bounds the
// cache independent of how many blocks it holds.
const BLOCK_CACHE_MAX_BYTES = 16 * 1024 * 1024

const blockCache = new Map<string, BlockEntry>()
let blockCacheBytes = 0

export function clearMarkdownBlockCache(): void {
  blockCache.clear()
  blockCacheBytes = 0
}

function evictBlockCacheIfNeeded(): void {
  while (blockCache.size > 0 && (blockCache.size >= BLOCK_CACHE_MAX || blockCacheBytes >= BLOCK_CACHE_MAX_BYTES)) {
    const oldest = blockCache.keys().next()
    if (oldest.done) return
    const entry = blockCache.get(oldest.value)
    if (entry !== undefined) blockCacheBytes -= entry.bytes
    blockCache.delete(oldest.value)
  }
}

// Segment objects cost far more heap than their text; the constant keeps the
// byte accounting within ~2x of actual heap usage.
const SEGMENT_HEAP_BYTES = 128

function rowsHeapBytes(rows: Segment[][]): number {
  let bytes = 0
  for (const row of rows) {
    for (const segment of row) bytes += SEGMENT_HEAP_BYTES + segment.text.length
  }
  return bytes
}

function cachedBlockRows(token: Token, ctx: BlockContext, streamId: string): BlockEntry {
  const key = `${ctx.thinking ? 't' : 'm'}\u0000${ctx.width}\u0000${streamId}\u0000${token.raw}`
  const hit = blockCache.get(key)
  if (hit !== undefined) return hit
  const rows = renderBlockRows(token, { ...ctx, streamId })
  const lines = rows.map(row => {
    let line = ''
    for (const segment of row) line += segment.text
    return line
  })
  let bytes = key.length
  for (const line of lines) bytes += line.length
  bytes += rowsHeapBytes(rows)
  const entry: BlockEntry = { rows, lines, bytes }
  evictBlockCacheIfNeeded()
  blockCache.set(key, entry)
  blockCacheBytes += bytes
  return entry
}

export function renderMarkdown(content: string, width: number, thinking = false, streamId = 'static'): MarkdownRenderResult {
  if (streamId !== 'static') dropStreamState(streamId)
  const palette = createMdPalette(thinking)
  const ctx: BlockContext = { palette, thinking, width: Math.max(4, width), streamId }
  const tokens = marked.lexer(healInlineTail(normalizeEol(content))) as Token[]
  const rows: Segment[][] = []
  const lines: string[] = []
  let pendingSeparator = false
  for (const [index, token] of tokens.entries()) {
    const entry = cachedBlockRows(token, ctx, `${streamId}:${index}`)
    if (entry.rows.length === 0) continue
    if (pendingSeparator && rows.length > 0) {
      rows.push([])
      lines.push('')
    }
    pendingSeparator = true
    rows.push(...entry.rows)
    lines.push(...entry.lines)
  }
  while (rows.length > 0 && rows[rows.length - 1]!.length === 0) {
    rows.pop()
    lines.pop()
  }
  return { rows, lines }
}

export function createMarkdownRenderer(width: number, thinking = false): MarkdownRenderer {
  return {
    update(content: string) {
      return renderMarkdown(content, width, thinking)
    },
  }
}

// ---------------------------------------------------------------------------
// Streaming render
//
// Re-lexing the full content on every streamed chunk makes per-frame cost
// O(total length); a 128KB answer spends tens of milliseconds per frame in
// marked's lexer alone. The streaming path finalizes blocks at blank-line
// boundaries outside fences and only lexes the unfinished tail each frame;
// the final settled render always goes through renderMarkdown, which is
// exact by construction. Adversarial mid-stream content (unclosed inline
// spans reaching across a finalized boundary) can render one transient frame
// differently before the next frame or the settled render corrects it.
//
// The boundary rule mirrors marked's block tokenizer: a blank run ends the
// previous block unless the next content line continues an open list —
// marked merges same-marker list items across blank lines (loose lists), so
// those runs must not cut. Fence semantics match marked's fence regex
// exactly (fenceOpenOf/fenceCloseOf), otherwise fence state diverges from
// the lexer.
// ---------------------------------------------------------------------------

type ListKind = 'bullet' | 'ordered'

function listMarkerOf(line: string): ListKind | undefined {
  const match = /^ {0,3}(?:([-+*])|(\d{1,9})[.)])(?:[ \t]+|$)/.exec(line)
  if (match === null) return undefined
  return match[1] !== undefined ? 'bullet' : 'ordered'
}

interface StreamRenderState {
  epoch: number
  width: number
  thinking: boolean
  /** Offset: content[:cut] is finalized into finalRows. */
  cut: number
  /** Offset: fence/boundary scan has consumed content[:scanPos]. */
  scanPos: number
  fence: FenceOpen | null
  blankRun: boolean
  /** Marker kind of the open list, when the current region is a list. */
  listKind: ListKind | undefined
  finalRows: Segment[][]
  finalLines: string[]
  /** Ordinal of the next block token; keeps blockCache keys stable as the tail finalizes. */
  tokenCount: number
  pendingSeparator: boolean
  prevContent: string
}

const STREAM_STATE_MAX = 32
// A state retains the content prefix plus the finalized row references, so a
// byte cap (content length as the proxy) prevents a handful of very large
// streams from pinning unbounded memory.
const STREAM_STATE_MAX_BYTES = 4 * 1024 * 1024

const streamRenderStates = new Map<string, StreamRenderState>()
let streamStateBytes = 0
let streamEpoch = 0

export function clearMarkdownStreamStates(): void {
  streamEpoch += 1
  streamRenderStates.clear()
  streamStateBytes = 0
}

function dropStreamState(streamId: string): void {
  const dropped = streamRenderStates.get(streamId)
  if (dropped !== undefined) streamStateBytes -= dropped.prevContent.length
  streamRenderStates.delete(streamId)
}

function touchStreamState(streamId: string, state: StreamRenderState): void {
  dropStreamState(streamId)
  streamRenderStates.set(streamId, state)
  streamStateBytes += state.prevContent.length
  while (streamRenderStates.size > 1 && (streamRenderStates.size > STREAM_STATE_MAX || streamStateBytes > STREAM_STATE_MAX_BYTES)) {
    const oldest = streamRenderStates.keys().next()
    if (oldest.done) break
    dropStreamState(oldest.value)
  }
}

/**
 * Advances the block-boundary scan over complete lines. A cut is recorded
 * where a blank run is followed by content that cannot continue the previous
 * block (lists continue across blank lines until a different block or a
 * different marker kind appears). Only complete lines (terminated by '\n')
 * are consumed: a partial trailing line still grows and may reclassify
 * (e.g. "```" completing into "``` para"), so it is re-scanned every frame.
 */
function scanStreamTail(
  content: string,
  from: number,
  fence: FenceOpen | null,
  blankRun: boolean,
  listKind: ListKind | undefined,
): { fence: FenceOpen | null; blankRun: boolean; listKind: ListKind | undefined; scanPos: number; boundary: number } {
  let open = fence
  let run = blankRun
  let kind = listKind
  let pos = from
  let boundary = -1
  const cut = (at: number): void => {
    if (boundary === -1) boundary = at
  }
  while (pos < content.length) {
    const nl = content.indexOf('\n', pos)
    if (nl === -1) break
    const line = content.slice(pos, nl)
    if (open !== null) {
      if (fenceCloseOf(line, open)) open = null
    } else {
      const opened = fenceOpenOf(line)
      if (opened !== null) {
        open = opened
        kind = undefined
        run = false
      } else if (/^\s*$/.test(line)) {
        run = true
      } else {
        const marker = listMarkerOf(line)
        if (marker !== undefined) {
          // Same marker kind across a blank run keeps one loose list.
          if (run && marker !== kind) cut(pos)
          kind = marker
          run = false
        } else if (/^ {2,}/.test(line) && kind !== undefined) {
          // Indented continuation of an open list item.
          run = false
        } else if (run) {
          // A blank run plus a non-list line always ends the open list.
          cut(pos)
          kind = undefined
          run = false
        }
        // A non-list line attached without a blank is a lazy continuation
        // (marked keeps it inside the item's paragraph), so kind persists.
      }
    }
    pos = nl + 1
  }
  if (boundary === -1 && run && open === null && kind === undefined && content.endsWith('\n')) {
    boundary = content.length
  }
  return { fence: open, blankRun: run, listKind: kind, scanPos: pos, boundary }
}

export function renderMarkdownStreaming(content: string, width: number, thinking: boolean, streamId: string): MarkdownRenderResult {
  if (content.includes('\r')) return renderMarkdown(content, width, thinking, streamId)
  let state = streamRenderStates.get(streamId)
  const valid = state !== undefined
    && state.epoch === streamEpoch
    && state.width === width
    && state.thinking === thinking
    && content.length >= state.prevContent.length
    && content.startsWith(state.prevContent)
  if (!valid) {
    state = {
      epoch: streamEpoch,
      width,
      thinking,
      cut: 0,
      scanPos: 0,
      fence: null,
      blankRun: false,
      listKind: undefined,
      finalRows: [],
      finalLines: [],
      tokenCount: 0,
      pendingSeparator: false,
      prevContent: '',
    }
  }
  state = state!
  const palette = createMdPalette(thinking)
  const ctx: BlockContext = { palette, thinking, width: Math.max(4, width), streamId }
  const scan = scanStreamTail(content, state.scanPos, state.fence, state.blankRun, state.listKind)
  state.fence = scan.fence
  state.blankRun = scan.blankRun
  state.listKind = scan.listKind
  state.scanPos = scan.scanPos
  // The per-frame accumulator copies the finalized prefix; tail rows are
  // transient (the same region is re-lexed next frame), so the state snapshot
  // is taken after the finalize pass and must not include them.
  const rows = state.finalRows.slice()
  const lines = state.finalLines.slice()
  let pendingSeparator = state.pendingSeparator
  if (scan.boundary > state.cut) {
    const tokens = marked.lexer(content.slice(state.cut, scan.boundary)) as Token[]
    for (const token of tokens) {
      const entry = cachedBlockRows(token, ctx, `${streamId}:${state.tokenCount}`)
      state.tokenCount += 1
      if (entry.rows.length === 0) continue
      if (pendingSeparator && rows.length > 0) {
        rows.push([])
        lines.push('')
      }
      pendingSeparator = true
      rows.push(...entry.rows)
      lines.push(...entry.lines)
    }
    state.cut = scan.boundary
  }
  state.finalRows = rows.slice()
  state.finalLines = lines.slice()
  state.pendingSeparator = pendingSeparator
  const tail = healStreamingTail(content.slice(state.cut), state.fence)
  const tokens = marked.lexer(tail) as Token[]
  const tailRows: Segment[][] = []
  const tailLines: string[] = []
  let tailIndex = 0
  for (const token of tokens) {
    const entry = cachedBlockRows(token, ctx, `${streamId}:${state.tokenCount + tailIndex}`)
    tailIndex += 1
    if (entry.rows.length === 0) continue
    if (pendingSeparator && rows.length + tailRows.length > 0) {
      tailRows.push([])
      tailLines.push('')
    }
    pendingSeparator = true
    tailRows.push(...entry.rows)
    tailLines.push(...entry.lines)
  }
  state.prevContent = content
  touchStreamState(streamId, state)
  const resultRows = rows.concat(tailRows)
  const resultLines = lines.concat(tailLines)
  while (resultRows.length > 0 && resultRows[resultRows.length - 1]!.length === 0) {
    resultRows.pop()
    resultLines.pop()
  }
  return { rows: resultRows, lines: resultLines }
}

function healStreamingTail(tail: string, fence: FenceOpen | null): string {
  if (tail === '' || fence !== null) return tail
  // An incomplete trailing line that starts with a fence marker may be a
  // fence opening (the scanner holds incomplete lines back), so inline
  // balancing must not treat its marker as an unclosed span.
  const nl = tail.lastIndexOf('\n')
  const lastLine = nl === -1 ? tail : tail.slice(nl + 1)
  if (/^ {0,3}(`{3,}|~{3,})/.test(lastLine)) return tail
  // Inline markers cannot span blank lines, so only the last paragraph-shaped
  // segment of the tail can leave a marker open at the streaming cut; the
  // suffix heals that segment and lands at the end of the tail.
  const breakAt = tail.lastIndexOf('\n\n')
  const last = breakAt === -1 ? tail : tail.slice(breakAt + 2)
  let suffix = ''
  const matches = [...last.matchAll(/(`+|~~|\*\*|__)/g)]
  if (matches.length > 0) {
    const marker = matches[matches.length - 1]![1]!
    const count = matches.filter(match => match[1] === marker).length
    if (count % 2 === 1) suffix = marker
  }
  return suffix === '' ? tail : tail + suffix
}
