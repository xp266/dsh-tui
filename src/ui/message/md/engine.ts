import { marked } from 'marked'
import type { Token } from 'marked'
import { mergeRuns } from '../../../core/segments.ts'
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

function scanFences(content: string): FenceScan {
  let open: { char: string; len: number } | null = null
  for (const line of content.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open !== null) {
      const close = match?.[1]
      if (close !== undefined && close[0] === open.char && close.length >= open.len) open = null
      continue
    }
    if (match !== null) open = { char: match[1]![0]!, len: match[1]!.length }
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

const blockCache = new Map<string, Segment[][]>()

export function clearMarkdownBlockCache(): void {
  blockCache.clear()
}

function cachedBlockRows(token: Token, ctx: BlockContext): Segment[][] {
  const key = `${ctx.thinking ? 't' : 'm'}\u0000${ctx.width}\u0000${token.raw}`
  const hit = blockCache.get(key)
  if (hit !== undefined) return hit
  const rows = renderBlockRows(token, ctx)
  if (blockCache.size >= 512) blockCache.clear()
  blockCache.set(key, rows)
  return rows
}

export function renderMarkdown(content: string, width: number, thinking = false): MarkdownRenderResult {
  const palette = createMdPalette(thinking)
  const ctx: BlockContext = { palette, thinking, width: Math.max(4, width) }
  const tokens = marked.lexer(healInlineTail(normalizeEol(content))) as Token[]
  const rows: Segment[][] = []
  let pendingSeparator = false
  for (const token of tokens) {
    const blockRows = cachedBlockRows(token, ctx)
    if (blockRows.length === 0) continue
    if (pendingSeparator && rows.length > 0) rows.push([])
    pendingSeparator = true
    rows.push(...blockRows)
  }
  while (rows.length > 0 && rows[rows.length - 1]!.length === 0) rows.pop()
  return { rows, lines: rows.map(row => mergeRuns(row).map(segment => segment.text).join('')) }
}

export function createMarkdownRenderer(width: number, thinking = false): MarkdownRenderer {
  return {
    update(content: string) {
      return renderMarkdown(content, width, thinking)
    },
  }
}
