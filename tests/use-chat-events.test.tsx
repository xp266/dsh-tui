import { Box, Text } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { useChatEvents } from '../src/ui/hooks/use-chat-events.ts'
import type { Message } from '../src/model/message.ts'
import { createFakeBridge } from './helpers/fake-bridge.ts'

function fakeBridge(): ChatBridge {
  return createFakeBridge()
}

function reasoning(text: string): SessionEvent {
  return { type: 'assistant/chunk', seq: 1, time: 0, data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text } } }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('useChatEvents', () => {
  it('keeps a manual toggle through subsequent event batches', async () => {
    let handler: ((event: SessionEvent) => void) | undefined
    const bridge = fakeBridge()
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    let updateMessages: ((fn: (messages: Message[]) => Message[]) => void) | undefined
    function Harness() {
      const chat = useChatEvents(bridge, false)
      updateMessages = chat.updateMessages
      return (
        <Box>
          {chat.messages.map(message =>
            message.kind === 'collapsible' && !message.collapsed
              ? <Text key={message.id}>{message.body}</Text>
              : null,
          )}
        </Box>
      )
    }
    const { lastFrame } = render(<Harness />)
    handler?.(reasoning('first pass'))
    await sleep(60)
    expect(lastFrame() ?? '').not.toContain('first pass')
    updateMessages?.(messages => messages.map(message =>
      message.kind === 'collapsible' && message.id === messages[0]?.id
        ? { ...message, collapsed: false }
        : message,
    ))
    await sleep(10)
    expect(lastFrame() ?? '').toContain('first pass')
    handler?.(reasoning('second pass'))
    await sleep(60)
    expect(lastFrame() ?? '').toContain('second pass')
    updateMessages?.(messages => messages.map(message =>
      message.kind === 'collapsible' && message.id === messages[0]?.id
        ? { ...message, collapsed: true }
        : message,
    ))
    await sleep(10)
    expect(lastFrame() ?? '').not.toContain('second pass')
  })
})