import stringWidth from 'string-width'
import { COLORS } from '../theme.ts'
import type { DeliveryMode } from './delivery.ts'

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
  /** Text injected into the sent message for a field of this kind; defaults to the label. */
  expand?(data: unknown): string
}

export interface SpecialFieldCreateInput {
  kind: string
  label: string
  owner?: FieldOwner
}

export interface SpecialFieldFactory {
  create(input: SpecialFieldCreateInput): string | null
  release(char: string): void
  /** Protect a chip from the automatic reclaim scans until the disposer runs. */
  pin(char: string): (() => void) | undefined
  isFieldChar(char: string): boolean
  labelOf(char: string): string | undefined
}

interface FieldSlot {
  kind: string
  label: string
  owner: FieldOwner
  pins: number
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

export function fieldExpandOf(kind: string): ((data: unknown) => string) | undefined {
  return kindDefs.get(kind)?.expand
}

export function specialFieldFactory(): SpecialFieldFactory {
  return {
    create: input => allocateField(input.kind, input.label, input.owner ?? 'composer'),
    release: releaseField,
    pin: pinField,
    isFieldChar,
    labelOf: char => fieldSlotOf(char)?.label,
  }
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
    slots.set(index, { kind, label, owner, pins: 0 })
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
  const index = char.charCodeAt(0) - FIELD_CHAR_BASE
  const slot = slots.get(index)
  if (slot === undefined || slot.pins > 0) return
  slots.delete(index)
}

/**
 * Release a field only when it belongs to `owner`. Plain `release` is
 * unconditional, so a caller holding a char the user deleted and reallocated
 * would free another component's live chip; the owner check makes abandoned
 * cleanup safe.
 */
export function releaseOwnedField(char: string, owner: FieldOwner): void {
  const slot = fieldSlotOf(char)
  if (slot === undefined || slot.owner !== owner) return
  releaseField(char)
}

/**
 * Hold a field slot against the automatic reclaim scans (composer edits and
 * message-list rebuilds drop every slot whose char is absent from the live
 * text). Callers that create chips outside the composer value — custom
 * windows, overlays, background tasks — must pin them and call the returned
 * disposer when done.
 */
export function pinField(char: string): (() => void) | undefined {
  if (char.length !== 1) return undefined
  const slot = slots.get(char.charCodeAt(0) - FIELD_CHAR_BASE)
  if (slot === undefined) return undefined
  slot.pins += 1
  return () => {
    slot.pins -= 1
  }
}

export function hasFieldSlots(owner: FieldOwner): boolean {
  for (const slot of slots.values()) {
    if (slot.owner === owner) return true
  }
  return false
}

/** Live slot chars for `owner`; the scan is O(live slots), not O(messages). */
export function fieldCharsOf(owner: FieldOwner): string[] {
  const chars: string[] = []
  for (const [index, slot] of slots) {
    if (slot.owner === owner) chars.push(String.fromCharCode(FIELD_CHAR_BASE + index))
  }
  return chars
}

export function releaseUnreferenced(owner: FieldOwner, keepText: string): void {
  for (const [index, slot] of slots) {
    if (slot.owner !== owner || slot.pins > 0) continue
    const char = String.fromCharCode(FIELD_CHAR_BASE + index)
    if (!keepText.includes(char)) slots.delete(index)
  }
}

/** Release `owner` slots whose char is absent from both lists. */
export function releaseMissingChars(owner: FieldOwner, present: readonly string[]): void {
  const live = new Set(present)
  for (const [index, slot] of slots) {
    if (slot.owner !== owner || slot.pins > 0) continue
    if (!live.has(String.fromCharCode(FIELD_CHAR_BASE + index))) slots.delete(index)
  }
}

export function releaseFields(owner: FieldOwner): void {
  for (const [index, slot] of slots) {
    if (slot.owner === owner && slot.pins === 0) slots.delete(index)
  }
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

/**
 * Chip text for one busy-Enter delivery mode. These labels name the scheduling
 * mode itself, so they stay English in every language, exactly like the `/goal`
 * keyword options a user types.
 */
export function deliveryChipLabel(mode: DeliveryMode): string {
  return mode === 'interrupt' ? 'Interrupt' : 'Queue'
}
