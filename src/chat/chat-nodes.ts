import { keyedRegistry } from '../kernel/registry.ts'
import type { ChatNodeDefinition, CustomMessage } from '../contract/index.ts'
import type { Message } from '../model/message.ts'
import type { TurnState } from './store.ts'

const definitions = keyedRegistry<ChatNodeDefinition>()

export function registerChatNode(definition: ChatNodeDefinition): () => void {
  return definitions.register(definition.id, definition, { order: definition.order })
}

export function subscribeChatNodes(listener: () => void): () => void {
  return definitions.subscribe(listener)
}

let sequence = 0

function nextNodeId(nodeId: string): string {
  sequence += 1
  return `node-${nodeId}-${sequence}`
}

function claimChatNode(messages: Message[], event: Parameters<ChatNodeDefinition['match']>[0], turn: TurnState, definition: ChatNodeDefinition): boolean {
  const claimedId = turn.chatNodes.get(definition.id)
  if (claimedId !== undefined) {
    const at = messages.findIndex(message => message.id === claimedId)
    const current = at >= 0 && messages[at]!.kind === 'custom' ? (messages[at] as CustomMessage) : undefined
    if (current !== undefined) {
      if (definition.update === undefined) return true
      const next = definition.update(event, current)
      if (next === null) {
        messages.splice(at, 1)
        turn.chatNodes.delete(definition.id)
        return true
      }
      messages[at] = { ...next, kind: 'custom', id: current.id }
      return true
    }
    turn.chatNodes.delete(definition.id)
  }
  const message: CustomMessage = { ...definition.start(event), kind: 'custom', id: nextNodeId(definition.id) }
  messages.push(message)
  turn.chatNodes.set(definition.id, message.id)
  return true
}

export function applyChatNodes(messages: Message[], event: Parameters<ChatNodeDefinition['match']>[0], turn: TurnState): boolean {
  for (const definition of definitions.values()) {
    if (!definition.match(event)) continue
    return claimChatNode(messages, event, turn, definition)
  }
  return false
}
