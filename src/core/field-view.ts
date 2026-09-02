import { fieldSlotOf, fieldStyleOf, hasFieldChar, isFieldChar } from './fields.ts'
import type { FieldStyle } from './fields.ts'
import type { MarkStyle, Segment } from './segments.ts'

export function expandFieldChars(text: string): string {
  if (!hasFieldChar(text)) return text
  let out = ''
  for (const char of text) {
    if (!isFieldChar(char)) {
      out += char
      continue
    }
    const slot = fieldSlotOf(char)
    // A slotless field char (reclaimed or foreign sentinel) would render as
    // a raw block glyph; drop it instead of emitting the code point.
    out += slot === undefined ? '' : slot.label
  }
  return out
}

export function fieldRowSegments(text: string, base?: MarkStyle): Segment[] {
  const out: Segment[] = []
  let plain = ''
  const flushPlain = (): void => {
    if (plain === '') return
    out.push({ text: plain, style: base ?? {} })
    plain = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    const slot = fieldSlotOf(char)
    if (slot === undefined) {
      // A slotless field char renders as a raw block glyph; omit it and keep
      // the surrounding plain run merged.
      if (!isFieldChar(char)) plain += char
      continue
    }
    flushPlain()
    const style = fieldStyleOf(slot)
    out.push({ text: slot.label, style: styleToMark(style) })
  }
  flushPlain()
  return out
}

function styleToMark(style: FieldStyle): MarkStyle {
  return {
    color: style.color,
    background: style.background,
    ...(style.bold === true ? { bold: true } : {}),
  }
}
