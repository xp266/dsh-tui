import {
  allocateField,
  charactersChipLabel,
  imageChipLabel,
  isFieldChar,
  linesChipLabel,
  releaseUnreferenced,
} from '../../core/fields.ts'
import { classifyPaste, summarizePaste } from '../../core/paste.ts'
import type { PendingImage } from '../../core/paste.ts'
import type { ClipboardImage } from '../../terminal/clipboard.ts'

export interface ComposerField {
  kind: 'image' | 'paste'
  label: string
  images?: PendingImage[]
  text?: string
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

export function reconcileComposerFields(value: string, fields: ComposerFieldMap): void {
  for (const char of fields.keys()) {
    if (!value.includes(char)) fields.delete(char)
  }
  releaseUnreferenced('composer', value)
}

export interface ComposerSubmission {
  text: string
  images: PendingImage[][]
}

export function expandComposerValue(value: string, fields: ComposerFieldMap): ComposerSubmission {
  let text = ''
  const images: PendingImage[][] = []
  for (const char of value) {
    const field = isFieldChar(char) ? fields.get(char) : undefined
    if (field === undefined) {
      text += char
      continue
    }
    if (field.kind === 'paste') text += field.text ?? ''
    else if ((field.images ?? []).length > 0) images.push(field.images!)
  }
  return { text: text.trim(), images }
}
