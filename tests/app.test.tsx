import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

function flatten(text: string): string {
  return stripAnsi(text).replace(/[▄▀]/g, '').replace(/\s+/g, ' ')
}

async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  let frame = lastFrame() ?? ''
  for (let i = 0; i < 120 && !frame.includes(text); i++) {
    await new Promise(resolve => setTimeout(resolve, 25))
    frame = lastFrame() ?? ''
  }
  return frame
}

function fakeBridge(): ChatBridge {
  return createFakeBridge()
}

describe('App layout', () => {
  it('withholds the bottom info until the bridge is ready', () => {
    const { lastFrame } = render(<App />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('deepseek-v4-flash')
    expect(frame).not.toContain('/ts/dsh-tui')
  })

  it('renders model name and cwd once the bridge is ready', async () => {
    const { lastFrame } = render(<App bridge={fakeBridge()} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('glm-4.7-flash')
    expect(frame).toContain('/ts/dsh-tui')
  })

  it('shows the resolved model name from the bridge', async () => {
    const { lastFrame } = render(<App bridge={fakeBridge()} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('glm-4.7-flash')
  })

  it('follows the bridge model name when the active session changes', async () => {
    const bridge = fakeBridge()
    let name = 'glm-4.7-flash'
    bridge.modelName = () => name
    const { lastFrame, rerender } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame() ?? '').toContain('glm-4.7-flash')
    name = 'deepseek-v4-flash'
    rerender(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('deepseek-v4-flash')
    expect(frame).not.toContain('glm-4.7-flash')
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
    await new Promise(resolve => setTimeout(resolve, 200))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('hello tui')
    expect(frame).toContain('Thought: 0ms')
    expect(frame).not.toContain('thinking hard')
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
    expect(frame).toContain('glm-4.7-flash')
    expect(flatten(frame)).toContain('Ctrl+A add providers · Ctrl+E configure')
    expect(frame).not.toContain('+Add')
  })

  it('opens the defaults window with the two carousel rows', async () => {
    const bridge = fakeBridge()
    bridge.listPresets = vi.fn(async () => [
      { id: 'standard', name: 'Standard mode' },
      { id: 'whale-chat', name: 'Whale chat' },
    ])
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('/defaults')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('defaults')
    expect(frame).toContain('Agent Preset:')
    expect(frame).toContain('Standard mode')
    expect(frame).toContain('Permission Mode:')
    expect(frame).toContain('Workspace Write')
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
    await waitForFrame(lastFrame, 'glm-4.7-flash')
    stdin.write('/preset')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    const frame = await waitForFrame(lastFrame, 'Creator mode')
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
    await waitForFrame(lastFrame, 'glm-4.7-flash')
    stdin.write('/preset')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    await waitForFrame(lastFrame, 'Creator mode')
    stdin.write('\u001b[B')
    await new Promise(resolve => setTimeout(resolve, 30))
    stdin.write('\r')
    const frame = await waitForFrame(lastFrame, 'the preset is fixed')
    expect(flatten(frame)).toContain('the preset is fixed once the session has started')
    expect(flatten(frame)).toContain('new to start a new session')
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
    const frame = await waitForFrame(lastFrame, 'Full access')
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
    stdin.write('/reasoning-effort')
    await new Promise(resolve => setTimeout(resolve, 20))
    stdin.write('\r')
    const start = Date.now()
    while (!(lastFrame() ?? '').includes('Off')) {
      if (Date.now() - start > 2000) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    const frame = lastFrame() ?? ''
    expect(frame).toContain('reasoning effort')
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
    const frame = stripAnsi(lastFrame() ?? '')
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

  it('keeps the working directory on the left and stats on the right while idle', async () => {
    const bridge = fakeBridge()
    bridge.cwd = () => '/home/user/py'
    const { lastFrame } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    const line = (lastFrame() ?? '').split('\n').find(line => line.includes('/home/user/py'))
    expect(line).toBeDefined()
    expect(line!.indexOf('/home/user/py')).toBeLessThan(line!.indexOf('Context 0%'))
  })

  it('shows spinner status with the esc hint on the bottom line while running', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    bridge.cwd = () => '/home/user/py'
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    handler?.({ type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } as unknown as SessionEvent)
    handler?.({ type: 'tool/call', seq: 2, time: 0, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' } } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 120))
    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toMatch(/Working/)
    const statusLine = frame.split('\n').find(line => line.includes('Working'))
    expect(statusLine).toContain('Working  Press esc to interrupt')
    expect(frame).not.toContain('/home/user/py')
  })

  it('shows the compacting status while a compaction is in flight and renders its bubble', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const { lastFrame } = render(<App bridge={bridge} />)
    handler?.({ type: 'compaction/start', seq: 1, time: 0, data: { compactionId: 'cp9', turn: null } } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 120))
    let frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toMatch(/Compacting/)
    expect(frame).toContain('Compact')
    handler?.({ type: 'compaction/summary', seq: 2, time: 0, data: { compactionId: 'cp9', summary: [{ type: 'text', text: 'kept the plan' }], shadowedSeqs: [1, 2], shadowedTokenCount: 900, provider: 'p', model: 'm' } } as unknown as SessionEvent)
    handler?.({ type: 'compaction/end', seq: 3, time: 0, data: { compactionId: 'cp9', turn: null } } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 120))
    frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('kept the plan')
    expect(frame).not.toMatch(/Compacting/)
  })

  it('interrupts on the second esc within three seconds but not the first', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    handler?.({ type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(stripAnsi(lastFrame() ?? '')).toContain('Press esc to interrupt')
    stdin.write('\x1b')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(bridge.interrupt).not.toHaveBeenCalled()
    expect(stripAnsi(lastFrame() ?? '')).toContain('Press esc again to interrupt')
    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Press esc to interrupt')
    stdin.write('\x1b')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(bridge.interrupt).toHaveBeenCalledTimes(1)
    expect(stripAnsi(lastFrame() ?? '')).toContain('Press esc to interrupt')
    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Press esc again to interrupt')
  })

  it('hides /todo until a todo_write exists and opens the task window while it is active', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const inactive = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 60))
    await inactive.stdin.write('/todo')
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(inactive.lastFrame() ?? '').not.toContain('Show the current task list')
    await inactive.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(stripAnsi(inactive.lastFrame() ?? '')).not.toContain('[√]')
    inactive.unmount()

    const view = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 60))
    handler?.({
      type: 'todo/write',
      seq: 10,
      time: 0,
      data: { todos: [{ content: '首先完成代码', status: 'completed' }, { content: '构建项目', status: 'pending' }] },
    } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(stripAnsi(view.lastFrame() ?? '')).not.toContain('todo_write')
    await view.stdin.write('/todo')
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(view.lastFrame() ?? '').toContain('Show the current task list')
    await view.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 60))
    const frame = stripAnsi(view.lastFrame() ?? '')
    expect(frame).toContain('[√] 首先完成代码')
    expect(frame).toContain('[ ] 构建项目')
    view.unmount()
  })

  it('shows the task badge next to the working status while a todo is active', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const { lastFrame } = render(<App bridge={bridge} />)
    handler?.({ type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } as unknown as SessionEvent)
    handler?.({
      type: 'tool/call',
      seq: 2,
      time: 0,
      data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' },
    } as unknown as SessionEvent)
    handler?.({
      type: 'todo/write',
      seq: 3,
      time: 0,
      data: {
        todos: [
          { content: 'a', status: 'completed' },
          { content: 'b', status: 'in_progress' },
          { content: 'c', status: 'pending' },
        ],
      },
    } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 150))
    const line = stripAnsi(lastFrame() ?? '').split('\n').find(line => line.includes('Working'))
    expect(line).toContain('[Task 2/3]')
    expect(line).toContain('Working')
    handler?.({
      type: 'todo/write',
      seq: 4,
      time: 0,
      data: { todos: [{ content: 'b', status: 'completed' }] },
    } as unknown as SessionEvent)
    await new Promise(resolve => setTimeout(resolve, 120))
    const cleared = stripAnsi(lastFrame() ?? '').split('\n').find(line => line.includes('Working'))
    expect(cleared).not.toContain('[Task')
  })
})