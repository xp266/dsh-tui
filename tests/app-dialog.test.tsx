import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
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

function focusedSegment(frame: string): string {
  return frame.match(/\x1b\[7m([^\x1b]*)/)?.[1] ?? ''
}

async function openModelsDialog(stdin: { write(data: string): void }) {
  act(() => {
    stdin.write('/models')
  })
  act(() => {
    stdin.write('\r')
  })
  act(() => {
    stdin.write('\r')
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('App dialog keyboard', () => {
  it('navigates the models dialog with arrow keys', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openModelsDialog(stdin)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Add Deepseek')
    expect(focusedSegment(frame)).toContain('+Add Deepseek')
    act(() => {
      stdin.write('\u001b[B')
    })
    const after = lastFrame() ?? ''
    expect(focusedSegment(after)).toContain('+Add Custom Model')
  })
})