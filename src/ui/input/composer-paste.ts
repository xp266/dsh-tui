import { keyedRegistry } from '../../kernel/registry.ts'
import type { PasteHandlerContribution, PasteResult } from '../../contract/index.ts'

const handlers = keyedRegistry<PasteHandlerContribution>()

export function registerPasteHandler(handler: PasteHandlerContribution): () => void {
  return handlers.register(handler.id, handler, { order: handler.order })
}

export function claimPaste(text: string, cursor: number): PasteResult | undefined {
  for (const handler of handlers.values()) {
    try {
      const result = handler.handle({ text, cursor })
      if (result !== undefined) return result
    } catch {}
  }
  return undefined
}
