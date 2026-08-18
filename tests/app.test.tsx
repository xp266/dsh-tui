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
    listSessions: vi.fn(async () => []),
    openSession: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
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
    tokenStats: () => ({ input: 0, output: 0, hitPercent: 0, contextPercent: 0 }),
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
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('model')
    expect(frame).toContain('+Add Deepseek')
    expect(frame).toContain('+Add Custom Model')
    expect(frame).toContain('glm-4.7-flash')
  })

  it('opens the preset window with the four built-in presets and a current marker', async () => {
    const bridge = fakeBridge()
    bridge.listPresets = vi.fn(async () => [
      { id: 'standard', name: 'Standard mode' },
      { id: 'code', name: 'Code mode' },
      { id: 'minimal', name: 'Minimal mode' },
      { id: 'cordis', name: 'Creator mode' },
    ])
    bridge.currentPreset = () => 'standard'
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('/preset')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('preset')
    expect(frame).toContain('Standard mode')
    expect(frame).toContain('Code mode')
    expect(frame).toContain('Minimal mode')
    expect(frame).toContain('Creator mode')
    expect(frame).toContain('current')
  })

  it('shows an error when selecting a preset on a started session', async () => {
    const bridge = fakeBridge()
    bridge.listPresets = vi.fn(async () => [
      { id: 'standard', name: 'Standard mode' },
      { id: 'code', name: 'Code mode' },
      { id: 'minimal', name: 'Minimal mode' },
      { id: 'cordis', name: 'Creator mode' },
    ])
    bridge.selectPreset = vi.fn(async () => {
      throw new Error('the preset is fixed once the session has started; use /new to start a new session')
    })
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('/preset')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\u001b[B')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('the preset is fixed once the session has started')
  })

  it('cycles the permission mode with Tab', async () => {
    let mode = 'workspace-write'
    let handler: ((event: SessionEvent) => void) | undefined
    const bridge = fakeBridge()
    bridge.permissionMode = () => mode
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    bridge.cyclePermission = () => {
      mode = 'danger-full-access'
      handler?.({ type: 'permission/preset', seq: 1, time: 0, data: { preset: 'danger-full-access' } } as unknown as SessionEvent)
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame() ?? '').toContain('Workspace Write')
    stdin.write('\t')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Full access')
    expect(frame).not.toContain('Workspace Write')
  })

  it('shows the working directory from the bridge', async () => {
    const bridge = fakeBridge()
    bridge.cwd = () => '/home/user/py'
    const { lastFrame } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame() ?? '').toContain('/home/user/py')
  })

  it('opens the effort window with the current model efforts and a current marker', async () => {
    const bridge = fakeBridge()
    bridge.listEfforts = vi.fn(async () => [
      { id: 'off', name: 'Off' },
      { id: 'high', name: 'High' },
      { id: 'max', name: 'Max' },
    ])
    bridge.currentEffort = () => 'high'
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('/model-effort')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('model effort')
    expect(frame).toContain('Off')
    expect(frame).toContain('High')
    expect(frame).toContain('Max')
    expect(frame).toContain('current')
  })

  it('shows mode, model, effort, and preset in the input bar line', async () => {
    const bridge = fakeBridge()
    bridge.effortName = () => 'High'
    bridge.presetName = () => 'Creator mode'
    const { lastFrame } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Workspace Write · glm-4.7-flash · High')
    expect(frame).toContain('Creator mode')
  })

  it('shows token stats and the working directory on the bottom line', async () => {
    const bridge = fakeBridge()
    bridge.cwd = () => '/home/user/py'
    bridge.tokenStats = () => ({ input: 1234, output: 56, hitPercent: 88, contextPercent: 42 })
    const { lastFrame } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Context 42%')
    expect(frame).toContain('Hit 88%')
    expect(frame).toContain('1.2K → 56')
    expect(frame).toContain('/home/user/py')
    expect(frame.indexOf('Context 42%')).toBeLessThan(frame.indexOf('Hit 88%'))
    expect(frame.indexOf('Hit 88%')).toBeLessThan(frame.indexOf('1.2K → 56'))
  })

  it('shows zeroed token stats without any chat', async () => {
    const { lastFrame } = render(<App bridge={fakeBridge()} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Context 0%')
    expect(frame).toContain('Hit 0%')
    expect(frame).toContain('0 → 0')
  })
})