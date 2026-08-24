import type { Token, Tokens } from 'marked'
import { mergeRuns } from '../../../core/segments.ts'
import type { MarkStyle, Segment } from '../../../core/segments.ts'
import type { MdPalette } from './palette.ts'

function mergeStyle(base: MarkStyle | undefined, extra: MarkStyle): MarkStyle {
  const merged: MarkStyle = {}
  const color = extra.color ?? base?.color
  if (color !== undefined) merged.color = color
  if (base?.bold === true || extra.bold === true) merged.bold = true
  if (base?.italic === true || extra.italic === true) merged.italic = true
  if (base?.strike === true || extra.strike === true) merged.strike = true
  if (base?.underline === true || extra.underline === true) merged.underline = true
  return merged
}

export function renderInline(tokens: Token[], palette: MdPalette, base?: MarkStyle): Segment[] {
  const out: Segment[] = []
  const emit = (text: string, style: MarkStyle): void => {
    if (text !== '') out.push({ text, style })
  }
  for (const token of tokens) {
    switch (token.type) {
      case 'strong': {
        const t = token as Tokens.Strong
        out.push(...renderInline(t.tokens, palette, mergeStyle(base, palette.bold)))
        break
      }
      case 'em': {
        const t = token as Tokens.Em
        out.push(...renderInline(t.tokens, palette, mergeStyle(base, palette.italic)))
        break
      }
      case 'del': {
        const t = token as Tokens.Del
        out.push(...renderInline(t.tokens, palette, mergeStyle(base, palette.strike)))
        break
      }
      case 'codespan': {
        const t = token as Tokens.Codespan
        emit(t.text.replace(/\n/gm, ' '), mergeStyle(base, palette.inlineCode))
        break
      }
      case 'link': {
        const t = token as Tokens.Link
        out.push(...renderInline(t.tokens.length > 0 ? t.tokens : [{ type: 'text', raw: t.text, text: t.text }], palette, mergeStyle(base, palette.link)))
        break
      }
      case 'image': {
        const t = token as Tokens.Image
        emit(t.text, base ?? palette.plain)
        break
      }
      case 'br': {
        emit('\n', palette.plain)
        break
      }
      case 'escape': {
        const t = token as Tokens.Escape
        emit(t.text, base ?? palette.plain)
        break
      }
      case 'inline-links':
      case 'url': {
        const t = token as Tokens.Generic & { href: string; text: string }
        emit(t.text !== '' ? t.text : t.href, mergeStyle(base, palette.link))
        break
      }
      case 'html': {
        const t = token as Tokens.HTML
        emit(t.raw.replace(/<br\s*\/?>/gi, '\n'), base ?? palette.plain)
        break
      }
      case 'text': {
        const t = token as Tokens.Text
        if (t.tokens !== undefined && t.tokens.length > 0) {
          out.push(...renderInline(t.tokens, palette, base))
        } else {
          emit(t.text, base ?? palette.plain)
        }
        break
      }
      default: {
        const raw = (token as Tokens.Generic).raw
        if (typeof raw === 'string') emit(raw, base ?? palette.plain)
        break
      }
    }
  }
  return mergeRuns(out)
}
