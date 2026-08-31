import { keyedRegistry } from '../../kernel/registry.ts'
import type { Message, MessageKind } from '../../model/message.ts'
import type { Segment } from '../../core/segments.ts'

export interface MessageRendererResult {
  lines: string[]
  rows?: Segment[][] | null
  bgs?: (string | undefined)[] | null
  /** Custom messages only: override the default view-key label. */
  customLabel?: string
  customMuted?: boolean
}

export interface MessageRendererContribution {
  /** Message kind to take over: 'bubble' | 'collapsible' | 'tool-diff' | 'compaction' | 'plan' | 'custom'. */
  kind: MessageKind
  order?: number
  render(message: Message, width: number): MessageRendererResult | undefined
}

const renderers = keyedRegistry<MessageRendererContribution>()

/**
 * Kind-keyed takeover of builtin message body rendering. Builtin rendering
 * stays inline in layout.ts and applies only when no override is registered,
 * so a plugin can re-present todo bubbles, plan text, diff bodies, and even
 * assistant bubbles. Disposal restores the builtin path.
 */
export function registerMessageRenderer(contribution: MessageRendererContribution): () => void {
  return renderers.register(contribution.kind, contribution, { order: contribution.order })
}

export function messageRendererOf(kind: MessageKind): MessageRendererContribution | undefined {
  return renderers.get(kind)
}

export function subscribeMessageRenderers(listener: () => void): () => void {
  return renderers.subscribe(listener)
}
