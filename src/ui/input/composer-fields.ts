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
    value += char
  }
  return value
}

export function insertImageField(images: PendingImage[], fields: ComposerFieldMap): string {
  if (images.length === 0) return ''
  const label = imageChipLabel(images.length)
  const char = allocateField('image', label, 'composer')
  if (char === null) return images.length === 1 && images[0]!.kind === 'path' ? images[0]!.path : label
  fields.set(char, { kind: 'image', label, images })
  return char
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
  return char
}

export function reconcileComposerFields(value: string, fields: ComposerFieldMap): void {
  for (const char of fields.keys()) {
    if (!value.includes(char)) fields.delete(char)
  }
  releaseUnreferenced('composer', value)
}

/** The delivery chip currently held in `value`, whichever mode it carries. */
export function deliveryFieldOf(value: string, fields: ComposerFieldMap): { char: string; mode: DeliveryMode } | undefined {
  for (const char of value) {
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field === undefined || !isDeliveryKind(field.kind)) continue
    return { char, mode: field.kind }
  }
  return undefined
}

/**
 * Append or replace the delivery chip at the end of the composer. At most one
 * chip exists at a time. A mode change must allocate a new chip because the
 * field kind carries the label and style, so the old chip is released first.
 */
export function insertDeliveryModeField(
  value: string,
  fields: ComposerFieldMap,
  mode: DeliveryMode,
): string | undefined {
  const existing = deliveryFieldOf(value, fields)
  if (existing !== undefined && existing.mode === mode) return value
  const without = existing === undefined ? value : removeDeliveryModeField(value, fields)
  const label = deliveryChipLabel(mode)
  const char = allocateField(DELIVERY_MODE_KINDS[mode], label, 'composer')
  if (char === null) return undefined
  fields.set(char, { kind: DELIVERY_MODE_KINDS[mode], label })
  return `${without}${char}`
}

/** Drop the delivery chip from `value`, releasing its field char. */
export function removeDeliveryModeField(value: string, fields: ComposerFieldMap): string {
  const existing = deliveryFieldOf(value, fields)
  if (existing === undefined) return value
  fields.delete(existing.char)
  releaseOwnedField(existing.char, 'composer')
  return value.replace(existing.char, '')
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
