import type { Token, Tokens } from 'marked'
import { mergeRuns, wrapSegments } from '../../../core/segments.ts'
import type { Segment } from '../../../core/segments.ts'
import { charWidth, segmentGraphemes, textWidth } from '../../../core/text.ts'
import { glyphs } from '../../../terminal/glyphs.ts'
import { highlightCodeBlock } from './highlight.ts'
import { renderInline } from './inline.ts'
import { markdownExtensions } from './extensions.ts'
import type { MdPalette } from './palette.ts'

export interface BlockContext {
  palette: MdPalette
  thinking: boolean
  width: number
  streamId: string
}

function plainOf(segments: Segment[]): string {
  return segments.map(segment => segment.text).join('')
}

function renderHeading(token: Tokens.Heading, ctx: BlockContext): Segment[][] {
  const style = ctx.palette.heading(token.depth)
  const segments = renderInline(token.tokens, ctx.palette, style)
  return wrapSegments(segments, ctx.width)
}

function renderCode(token: Tokens.Code, ctx: BlockContext): Segment[][] {
  if (token.text === '') return []
  const lang = token.lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const highlighted = highlightCodeBlock(token.text, lang, ctx.thinking, ctx.streamId)
  const segments = highlighted ?? [{ text: token.text, style: lang === '' ? ctx.palette.codeFallback : ctx.palette.codePlain }]
  return wrapSegments(segments, ctx.width)
}

function renderParagraphish(tokens: Token[], ctx: BlockContext): Segment[][] {
  return wrapSegments(renderInline(tokens, ctx.palette), ctx.width)
}

function renderHr(ctx: BlockContext): Segment[][] {
  return [[{ text: glyphs.horizontal.repeat(Math.max(ctx.width, 8)), style: ctx.palette.hr }]]
}

const TABLE_SAFETY_COLS = 2

interface TableCell {
  text: string
  segments: Segment[]
}

function renderTable(token: Tokens.Table, ctx: BlockContext): Segment[][] {
  const headerCells: TableCell[] = token.header.map(cell => ({
    text: cell.text,
    segments: renderInline(cell.tokens, ctx.palette),
  }))
  const bodyRows = token.rows.map(row => row.map<TableCell>(cell => ({
    text: cell.text,
    segments: renderInline(cell.tokens, ctx.palette),
  })))
  const allRows = [headerCells, ...bodyRows]
  const cols = Math.max(1, ...allRows.map(cells => cells.length))
  const widths: number[] = []
  const mins: number[] = []
  for (let c = 0; c < cols; c++) {
    let natural = 1
    let min = 1
    for (const cells of allRows) {
      const text = (cells[c]?.text ?? '').trim()
      natural = Math.max(natural, textWidth(text))
      for (const { segment } of segmentGraphemes(text)) min = Math.max(min, charWidth(segment))
    }
    widths.push(natural)
    mins.push(min)
  }
  const budget = Math.max(cols, ctx.width - (cols * 3 + 1) - TABLE_SAFETY_COLS)
  const sum = (): number => widths.reduce((a, b) => a + b, 0)
  while (sum() > budget) {
    let maxIdx = -1
    for (let c = 0; c < cols; c++) {
      if (widths[c]! <= mins[c]!) continue
      if (maxIdx === -1 || widths[c]! > widths[maxIdx]!) maxIdx = c
    }
    if (maxIdx === -1) break
    widths[maxIdx] -= 1
  }
  const blocksByRow = allRows.map(cells => {
    const blocks: Segment[][][] = []
    for (let c = 0; c < cols; c++) {
      const segs = cells[c]?.segments ?? []
      blocks.push(segs.length === 0 ? [[]] : wrapSegments(segs, widths[c]!))
    }
    return blocks
  })
  const effective = widths.slice()
  for (const blocks of blocksByRow) {
    for (let c = 0; c < cols; c++) {
      for (const rowSegs of blocks[c]!) {
        effective[c] = Math.max(effective[c]!, textWidth(plainOf(rowSegs)))
      }
    }
  }
  const borderStyle = ctx.palette.hr
  const borderRow = (left: string, mid: string, right: string): Segment[] =>
    [{ text: left + widths.map(w => glyphs.horizontal.repeat(w + 2)).join(mid) + right, style: borderStyle }]
  const renderRowBlock = (blocks: Segment[][][]): Segment[][] => {
    let height = 1
    for (let c = 0; c < cols; c++) height = Math.max(height, blocks[c]!.length)
    const out: Segment[][] = []
    for (let h = 0; h < height; h++) {
      const line: Segment[] = [{ text: glyphs.tableVertical, style: borderStyle }]
      for (let c = 0; c < cols; c++) {
        const rowSegs = blocks[c]![h] ?? []
        const used = textWidth(plainOf(rowSegs))
        line.push({ text: ' ', style: ctx.palette.plain })
        line.push(...rowSegs)
        line.push(
          { text: ' '.repeat(Math.max(0, effective[c]! - used + 1)), style: ctx.palette.plain },
          { text: glyphs.tableVertical, style: borderStyle },
        )
      }
      out.push(mergeRuns(line))
    }
    return out
  }
  return [
    borderRow(...glyphs.tableBorders.top),
    ...renderRowBlock(blocksByRow[0]!),
    borderRow(...glyphs.tableBorders.middle),
    ...blocksByRow.slice(1).flatMap(blocks => renderRowBlock(blocks)),
    borderRow(...glyphs.tableBorders.bottom),
  ]
}

interface ItemParts {
  headTokens: Token[]
  childTokens: Token[]
}

function splitItemTokens(item: Tokens.ListItem): ItemParts {
  const headTokens: Token[] = []
  const childTokens: Token[] = []
  let scanningHead = true
  for (const token of item.tokens ?? []) {
    if (scanningHead && (token.type === 'text' || token.type === 'paragraph' || token.type === 'checkbox')) {
      if (token.type !== 'checkbox') headTokens.push(token)
      continue
    }
    scanningHead = false
    childTokens.push(token)
  }
  return { headTokens, childTokens }
}

function markerSegments(item: Tokens.ListItem, ordered: boolean, label: string, depth: number, palette: MdPalette): Segment[] {
  if (item.task === true) {
    return [{ text: item.checked ? glyphs.taskChecked : glyphs.taskUnchecked, style: item.checked ? palette.taskDone : palette.taskTodo }]
  }
  if (ordered) return [{ text: label, style: palette.listMarker }]
  return [{ text: glyphs.bullets[Math.min(depth, glyphs.bullets.length - 1)]!, style: palette.listMarker }]
}

function indentRows(rows: Segment[][], indent: string, palette: MdPalette): Segment[][] {
  const pad: Segment = { text: indent, style: palette.plain }
  return rows.map(row => [pad, ...row])
}

export function renderList(token: Tokens.List, depth: number, ctx: BlockContext): Segment[][] {
  const rows: Segment[][] = []
  const ordered = token.ordered === true
  const start = typeof token.start === 'number' && Number.isFinite(token.start) ? Math.trunc(token.start) : 1
  for (let index = 0; index < token.items.length; index++) {
    const item = token.items[index]!
    const { headTokens, childTokens } = splitItemTokens(item)
    const markerSegs = markerSegments(item, ordered, `${start + index}.`, depth, ctx.palette)
    const markerText = plainOf(markerSegs)
    const hang = Math.min(textWidth(markerText) + 1, Math.max(2, Math.floor(ctx.width / 2)))
    const innerCtx: BlockContext = { ...ctx, width: Math.max(4, ctx.width - hang) }
    const pad = ' '.repeat(hang)
    const itemRows: Segment[][] = []
    const inlineRows = renderParagraphish(headTokens.flatMap(token => (token as Tokens.Text).tokens ?? []), innerCtx)
    if (inlineRows.length === 0) {
      itemRows.push(mergeRuns(markerSegs))
    } else {
      itemRows.push(mergeRuns([...markerSegs, { text: ' ', style: ctx.palette.plain }, ...inlineRows[0]!]))
      for (let r = 1; r < inlineRows.length; r++) {
        itemRows.push([{ text: pad, style: ctx.palette.plain }, ...inlineRows[r]!])
      }
    }
    for (const child of childTokens) {
      if (child.type === 'list') {
        itemRows.push(...indentRows(renderList(child as Tokens.List, depth + 1, innerCtx), pad, ctx.palette))
      } else {
        itemRows.push(...indentRows(renderBlockRows(child, innerCtx), pad, ctx.palette))
      }
    }
    rows.push(...itemRows)
  }
  return rows
}

export function renderBlockquote(token: Tokens.Blockquote, ctx: BlockContext): Segment[][] {
  const innerCtx: BlockContext = { ...ctx, width: Math.max(4, ctx.width - 2) }
  const inner: Segment[][] = []
  for (const child of token.tokens ?? []) {
    inner.push(...renderBlockRows(child, innerCtx))
  }
  const bar: Segment = { text: glyphs.quoteBar, style: ctx.palette.quoteBar }
  return inner.map(row => mergeRuns([bar, { text: ' ', style: ctx.palette.plain }, ...row]))
}

export function renderBlockRows(token: Token, ctx: BlockContext): Segment[][] {
  const contributed = markdownExtensions.markdownBlockOf(token)
  if (contributed !== undefined) return contributed.render(token, ctx)
  switch (token.type) {
    case 'heading':
      return renderHeading(token as Tokens.Heading, ctx)
    case 'paragraph':
      return renderParagraphish((token as Tokens.Paragraph).tokens, ctx)
    case 'text':
      return renderParagraphish((token as Tokens.Text).tokens ?? [], ctx)
    case 'code':
      return renderCode(token as Tokens.Code, ctx)
    case 'hr':
      return renderHr(ctx)
    case 'table':
      return renderTable(token as Tokens.Table, ctx)
    case 'blockquote':
      return renderBlockquote(token as Tokens.Blockquote, ctx)
    case 'list':
      return renderList(token as Tokens.List, 0, ctx)
    case 'html': {
      const raw = (token as Tokens.HTML).raw.replace(/\n$/, '')
      return wrapSegments([{ text: raw, style: ctx.palette.codeFallback }], ctx.width)
    }
    default: {
      // Unknown block tokens (from marked extensions) render their raw text
      // instead of silently disappearing. Structural no-op tokens (link
      // reference definitions, blank runs) stay invisible.
      if (token.type === 'def' || token.type === 'space') return []
      const raw = (token as { raw?: string }).raw ?? ''
      if (raw.trim() === '') return []
      return raw.replace(/\n$/, '')
        .split('\n')
        .map(line => [{ text: line, style: ctx.palette.plain }])
    }
  }
}
