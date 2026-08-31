import { keyedRegistry } from '../../kernel/registry.ts'
import type { InputStatusContribution, InputStatusContext } from '../../contract/index.ts'

const inputStatus = keyedRegistry<InputStatusContribution>()

/**
 * Contributions render segments into the composer status line, between the
 * builtin mode/model/effort parts and the caret nonce. Order controls the
 * sequence; default 100.
 */
export function registerInputStatus(contribution: InputStatusContribution): () => void {
  return inputStatus.register(contribution.id, contribution, { order: contribution.order })
}

export function subscribeInputStatus(listener: () => void): () => void {
  return inputStatus.subscribe(listener)
}

export function inputStatusParts(context: InputStatusContext): Array<{ text: string; color?: string; bold?: boolean }> {
  const parts: Array<{ text: string; color?: string; bold?: boolean }> = []
  for (const contribution of inputStatus.values()) {
    const rendered = contribution.render(context)
    if (rendered === null || rendered === undefined) continue
    const list = Array.isArray(rendered) ? rendered : [rendered]
    for (const part of list) {
      if (part.text === '') continue
      parts.push(part.color === undefined && part.bold === undefined ? { text: part.text } : part)
    }
  }
  return parts
}
