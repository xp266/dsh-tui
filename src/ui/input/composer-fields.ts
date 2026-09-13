import {
  allocateField,
  charactersChipLabel,
  deliveryChipLabel,
  fieldExpandOf,
  imageChipLabel,
  isFieldChar,
  linesChipLabel,
  releaseOwnedField,
  releaseUnreferenced,
} from '../../core/fields.ts'
import { classifyPaste, summarizePaste } from '../../core/paste.ts'
import type { PendingImage } from '../../core/paste.ts'
import type { DeliveryMode } from '../../core/delivery.ts'
import type { ClipboardImage } from '../../terminal/clipboard.ts'

export type { DeliveryMode } from '../../core/delivery.ts'

/** Field kinds carrying a delivery mode; the chip is display-only and never sent. */
export const DELIVERY_MODE_KINDS: Readonly<Record<DeliveryMode, string>> = {
  interrupt: 'interrupt',
  queue: 'queue',
}

export function isDeliveryKind(kind: string): kind is DeliveryMode {
  return kind === 'interrupt' || kind === 'queue'
}

export interface ComposerField {
  kind: string
  label: string
  images?: PendingImage[]
  text?: string
  data?: unknown
}

export type ComposerFieldMap = Map<string, ComposerField>

/**
 * A chip is inserted with one trailing space so the caret never sits flush
 * against the colored block while the user keeps typing.
 */
function chipWithSpace(char: string): string {
  return `${char} `
}

export function buildPasteFields(normalized: string, fields: ComposerFieldMap): string {
  const segments = classifyPaste(normalized)
  let value = ''
  for (const segment of segments) {
    if (segment.type === 'images') {
      value += insertImageField(segment.paths.map(path => ({ kind: 'path' as const, path })), fields)
      continue
    }
    const summary = summarizePaste(segment.text)
    if (summary === null) {
      value += segment.text
      continue
    }
    const label = summary.lines > 1 ? linesChipLabel(summary.lines) : charactersChipLabel(summary.characters)
    const char = allocateField('paste', label, 'composer')
    if (char === null) {
      value += segment.text
      continue
    }
    fields.set(char, { kind: 'paste', label, text: segment.text })
    value += chipWithSpace(char)
  }
  return value
}

export function insertImageField(images: PendingImage[], fields: ComposerFieldMap): string {
  if (images.length === 0) return ''
  const label = imageChipLabel(images.length)
  const char = allocateField('image', label, 'composer')
  if (char === null) return images.length === 1 && images[0]!.kind === 'path' ? images[0]!.path : label
  fields.set(char, { kind: 'image', label, images })
  return chipWithSpace(char)
}

export function insertClipboardImage(image: ClipboardImage, fields: ComposerFieldMap): string {
  return insertImageField([{
    kind: 'data',
    data: image.data,
    mediaType: image.mediaType,
    name: 'clipboard',
  }], fields)
}

export function insertFieldSpec(
  spec: { kind: string; label: string; data?: unknown },
  fields: ComposerFieldMap,
): string {
  const char = allocateField(spec.kind, spec.label, 'composer')
  if (char === null) return spec.label
  let field: ComposerField
  if (spec.kind === 'paste') {
    field = { kind: 'paste', label: spec.label, text: typeof spec.data === 'string' ? spec.data : spec.label }
  } else if (spec.kind === 'image' && Array.isArray(spec.data)) {
    field = { kind: 'image', label: spec.label, images: spec.data as PendingImage[] }
  } else {
    field = { kind: spec.kind, label: spec.label, data: spec.data }
  }
  fields.set(char, field)
  return chipWithSpace(char)
}

export function reconcileComposerFields(value: string, fields: ComposerFieldMap): void {
  for (const char of fields.keys()) {
    if (!value.includes(char)) fields.delete(char)
  }
  releaseUnreferenced('composer', value)
}

/**
 * The first delivery chip in `value` (scan order) with its char index. A queue
 * chip is a delimiter: it closes every character before it into one queued
 * segment, so the first chip is the head of the pending pipeline.
 */
export function firstDeliveryField(
  value: string,
  fields: ComposerFieldMap,
): { char: string; mode: DeliveryMode; at: number } | undefined {
  for (let at = 0; at < value.length; at++) {
    const char = value[at]!
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field === undefined || !isDeliveryKind(field.kind)) continue
    return { char, mode: field.kind, at }
  }
  return undefined
}

/** Number of delivery chips held in `value`; one queued turn per chip. */
export function countDeliveryFields(value: string, fields: ComposerFieldMap): number {
  let count = 0
  for (const char of value) {
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field !== undefined && isDeliveryKind(field.kind)) count += 1
  }
  return count
}

/**
 * The text after the last delivery chip (past its trailing space). This is the
 * segment the next appended chip would close; empty means there is nothing new
 * to queue.
 */
export function segmentAfterLastDelivery(value: string, fields: ComposerFieldMap): string {
  let end = 0
  for (let at = 0; at < value.length; at++) {
    const char = value[at]!
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field === undefined || !isDeliveryKind(field.kind)) continue
    end = at + (value[at + 1] === ' ' ? 2 : 1)
  }
  return value.slice(end)
}

/**
 * Allocate one delivery chip and return its char plus the trailing space, ready
 * to splice into the buffer. Every call mints a new sentinel, so the buffer can
 * hold a FIFO pipeline of queued segments.
 */
export function createDeliveryModeChip(fields: ComposerFieldMap, mode: DeliveryMode): string | undefined {
  const label = deliveryChipLabel(mode)
  const char = allocateField(DELIVERY_MODE_KINDS[mode], label, 'composer')
  if (char === null) return undefined
  fields.set(char, { kind: DELIVERY_MODE_KINDS[mode], label })
  return chipWithSpace(char)
}

/**
 * Split `value` at its first delivery chip: `head` is the queued segment the
 * chip closes, `rest` is everything after the chip and its trailing space, with
 * the chip's field released. `mode` is the chip's delivery mode and `consumed`
 * is the number of chars removed from the front (so a caller can shift the
 * caret). Returns undefined when no chip is present.
 */
export function splitAtFirstDelivery(
  value: string,
  fields: ComposerFieldMap,
): { head: string; rest: string; mode: DeliveryMode; consumed: number } | undefined {
  const first = firstDeliveryField(value, fields)
  if (first === undefined) return undefined
  fields.delete(first.char)
  releaseOwnedField(first.char, 'composer')
  const skip = value[first.at + 1] === ' ' ? 2 : 1
  return { head: value.slice(0, first.at), rest: value.slice(first.at + skip), mode: first.mode, consumed: first.at + skip }
}

export interface ComposerSubmission {
  text: string
  images: PendingImage[][]
  /** Delivery mode carried by a chip, or undefined for an ordinary prompt. */
  mode?: DeliveryMode
}

export function expandComposerValue(value: string, fields: ComposerFieldMap): ComposerSubmission {
  let text = ''
  const images: PendingImage[][] = []
  let mode: DeliveryMode | undefined
  for (const char of value) {
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field === undefined) {
      text += char
      continue
    }
    if (field.kind === 'paste') text += field.text ?? ''
    else if (field.kind === 'image' && (field.images ?? []).length > 0) images.push(field.images!)
    // The delivery chip is display-only: it selects how the message is
    // delivered and contributes no text to it.
    else if (isDeliveryKind(field.kind)) mode = field.kind
    else text += fieldExpandOf(field.kind)?.(field.data) ?? field.label
  }
  return { text: text.trim(), images, ...(mode === undefined ? {} : { mode }) }
}
