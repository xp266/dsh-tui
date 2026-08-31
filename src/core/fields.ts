import stringWidth from 'string-width'
import { COLORS } from '../theme.ts'

const FIELD_CHAR_BASE = 0xe000
const FIELD_CHAR_END = 0xf8ff
const FIELD_CHAR_COUNT = FIELD_CHAR_END - FIELD_CHAR_BASE + 1

export type FieldOwner = 'composer' | 'message'

export interface FieldStyle {
  color: string
  background: string
  bold?: boolean
}

export interface FieldKindDef {
  kind: string
  style(): FieldStyle
}

interface FieldSlot {
  kind: string
  label: string
  owner: FieldOwner
}

const slots = new Map<number, FieldSlot>()
const kindDefs = new Map<string, FieldKindDef>()
const labelWidthCache = new Map<string, number>()
let cursor = 0

export function specialFieldStyle(): FieldStyle {
  return { color: COLORS.specialFieldText, background: COLORS.specialFieldBackground, bold: true }
}

export function registerFieldKind(def: FieldKindDef): () => void {
  kindDefs.set(def.kind, def)
  return () => {
    if (kindDefs.get(def.kind) === def) kindDefs.delete(def.kind)
  }
}

export function fieldStyleOf(slot: FieldSlot): FieldStyle {
  const def = kindDefs.get(slot.kind)
  if (def !== undefined) return def.style()
  return specialFieldStyle()
}

export function isFieldCode(code: number): boolean {
  return code >= FIELD_CHAR_BASE && code <= FIELD_CHAR_END
}

export function hasFieldChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isFieldCode(text.charCodeAt(i))) return true
  }
  return false
}

export function isFieldChar(char: string): boolean {
  return char.length === 1 && isFieldCode(char.charCodeAt(0))
}

export function fieldCodeWidth(code: number): number {
  const slot = slots.get(code - FIELD_CHAR_BASE)
  if (slot === undefined) return 1
  return labelWidth(slot.label)
}

function labelWidth(label: string): number {
  const hit = labelWidthCache.get(label)
  if (hit !== undefined) return hit
  const width = stringWidth(label)
  if (labelWidthCache.size >= 4096) labelWidthCache.clear()
  labelWidthCache.set(label, width)
  return width
}

export function allocateField(kind: string, label: string, owner: FieldOwner): string | null {
  for (let i = 0; i < FIELD_CHAR_COUNT; i++) {
    const index = (cursor + i) % FIELD_CHAR_COUNT
    if (slots.has(index)) continue
    cursor = (index + 1) % FIELD_CHAR_COUNT
    slots.set(index, { kind, label, owner })
    return String.fromCharCode(FIELD_CHAR_BASE + index)
  }
  return null
}

export function fieldSlotOf(char: string): FieldSlot | undefined {
  if (char.length !== 1) return undefined
  const code = char.charCodeAt(0)
  if (!isFieldCode(code)) return undefined
  return slots.get(code - FIELD_CHAR_BASE)
}

export function releaseField(char: string): void {
  if (char.length !== 1) return
  slots.delete(char.charCodeAt(0) - FIELD_CHAR_BASE)
}

export function releaseFields(owner: FieldOwner): void {
  for (const [index, slot] of slots) {
    if (slot.owner === owner) slots.delete(index)
  }
}

export function releaseUnreferenced(owner: FieldOwner, keepText: string): void {
  for (const [index, slot] of slots) {
    if (slot.owner !== owner) continue
    const char = String.fromCharCode(FIELD_CHAR_BASE + index)
    if (!keepText.includes(char)) slots.delete(index)
  }
}

export function releaseAllFields(): void {
  slots.clear()
  cursor = 0
}

export function fieldCharsIn(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isFieldCode(code)) out.push(text[i]!)
  }
  return out
}

export function imageChipLabel(count: number): string {
  return `[${count} images]`
}

export function linesChipLabel(count: number): string {
  return `[${count} lines]`
}

export function charactersChipLabel(count: number): string {
  return `[${count} characters]`
}
