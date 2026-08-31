import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { allocateField, imageChipLabel } from '../core/fields.ts'

export function textFromBlocks(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-result') text += textFromBlocks(block.content)
  }
  return text
}

export function reasoningFromBlocks(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'reasoning') text += block.text
  }
  return text
}

export function userDisplayText(blocks: readonly ContentBlock[]): string {
  let text = ''
  let pendingImages = 0
  const flushImages = (): void => {
    if (pendingImages === 0) return
    const label = imageChipLabel(pendingImages)
    const char = allocateField('image', label, 'message')
    text += char ?? label
    pendingImages = 0
  }
  for (const block of blocks) {
    if (block.type === 'image') {
      pendingImages += 1
      continue
    }
    flushImages()
    if (block.type === 'text' && block.text !== '') text += block.text
  }
  flushImages()
  return text
}
