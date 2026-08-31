import { keyedRegistry } from '../../kernel/registry.ts'
import type { MessageViewContribution } from '../../contract/index.ts'

const views = keyedRegistry<MessageViewContribution>()

export function registerMessageView(contribution: MessageViewContribution): () => void {
  return views.register(contribution.view, contribution, { order: contribution.order })
}

export function messageViewOf(view: string): MessageViewContribution | undefined {
  return views.get(view)
}

export function subscribeMessageViews(listener: () => void): () => void {
  return views.subscribe(listener)
}
