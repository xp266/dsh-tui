import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'

function fakeBridge(): ChatBridge {
  return {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    subscribe: () => () => {},
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
  }
}

describe('App layout', () => {
  it('renders the empty shell with model name and cwd', () => {
    const { lastFrame } = render(<App />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('glm 4.7')
    expect(frame).toContain('/ts/dsh-tui')
  })

  it('shows the resolved model name from the bridge', async () => {
    const { lastFrame } = render(<App bridge={fakeBridge()} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('glm-4.7-flash')
  })

  it('renders no box-drawing or block characters other than half-block edges', () => {
    const { lastFrame } = render(<App bridge={fakeBridge()} />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toMatch(/[┌┐└┘─│█]/)
  })

  it('renders chat events pushed through the bridge', async () => {
    let handler: ((event: SessionEvent) => void) | undefined
    const bridge = fakeBridge()
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const { lastFrame } = render(<App bridge={bridge} />)
    handler?.({
      type: 'user/message',
      seq: 1,
      time: 0,
      data: createUserMessage({ content: [{ type: 'text', text: 'hello tui' }], source: { kind: 'user' } }),
    })
    handler?.({
      type: 'assistant/chunk',
      seq: 2,
      time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'thinking hard' } },
    })
    handler?.({
      type: 'assistant/chunk',
      seq: 3,
      time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'answer' } },
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('hello tui')
    expect(frame).toContain('Thinking')
    expect(frame).toContain('thinking hard')
    expect(frame).toContain('answer')
  })

  it('opens the model window when /models is sent', async () => {
    const bridge = fakeBridge()
    bridge.listModels = vi.fn(async () => [
      { id: 'glm-4.7-flash', name: 'glm-4.7-flash', provider: 'zai', providerName: 'zai' },
    ])
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('/models')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('model')
    expect(frame).toContain('+Add Deepseek')
    expect(frame).toContain('+Add Custom Model')
    expect(frame).toContain('glm-4.7-flash')
  })
})