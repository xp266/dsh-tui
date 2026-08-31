import { fieldSlotOf, fieldStyleOf, hasFieldChar } from './fields.ts'
import type { FieldStyle } from './fields.ts'
import type { MarkStyle, Segment } from './segments.ts'

export function expandFieldChars(text: string): string {
  if (!hasFieldChar(text)) return text
  let out = ''
  for (const char of text) {
    const slot = fieldSlotOf(char)
    out += slot === undefined ? char : slot.label
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
      plain += char
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
