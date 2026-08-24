import { Box, Text } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { InteractionStore } from '../src/chat/interactions.ts'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { useChatEvents } from '../src/ui/hooks/use-chat-events.ts'
import type { Message } from '../src/model/message.ts'

function fakeBridge(): ChatBridge {
  return {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    interrupt: vi.fn(),
    subscribe: () => () => {},
    listSessions: vi.fn(async () => []),
    openSession: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    archiveSession: vi.fn(async () => {}),
    activeSessionId: () => '',
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
    listProviderDirectory: vi.fn(async () => []),
    fetchProviderModels: vi.fn(async () => []),
    saveBuiltinProvider: vi.fn(async () => {}),
    cwd: () => process.cwd(),
    listPresets: vi.fn(async () => []),
    currentPreset: () => 'standard',
    presetName: () => 'Standard mode',
    selectPreset: vi.fn(async () => {}),
    listEfforts: vi.fn(async () => []),
    currentEffort: () => undefined,
    effortName: () => undefined,
    selectEffort: vi.fn(async () => {}),
    permissionMode: () => 'workspace-write',
    cyclePermission: vi.fn(),
    listPermissionPresets: vi.fn(async () => ['read-only', 'workspace-write', 'danger-full-access']),
    defaultPermission: () => 'workspace-write',
    setDefaultPermission: vi.fn(async () => {}),
    defaultPresetId: () => 'standard',
    setDefaultPreset: vi.fn(async () => {}),
    tokenStats: () => ({ input: 0, output: 0, hitPercent: 0, contextPercent: 0 }),
    toolPresenter: { call: () => undefined, result: () => undefined, argsJson: () => undefined },
    interactions: new InteractionStore(),
  }
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
    expect(lastFrame() ?? '').toContain('first pass')
    updateMessages?.(messages => messages.map(message =>
      message.kind === 'collapsible' && message.id === messages[0]?.id
        ? { ...message, collapsed: true }
        : message,
    ))
    await sleep(10)
    expect(lastFrame() ?? '').not.toContain('first pass')
    handler?.(reasoning('second pass'))
    await sleep(60)
    expect(lastFrame() ?? '').not.toContain('second pass')
  })
})