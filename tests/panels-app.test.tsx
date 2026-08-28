import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { InteractionStore } from '../src/chat/interactions.ts'

async function settle(ms = 25): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function fakeBridge(interactions: InteractionStore): ChatBridge {
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
    readModelEntries: () => [],
    saveModelEntry: vi.fn(async () => {}),
    deleteModelEntry: vi.fn(async () => {}),
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
    toolPresenter: {
      call: () => undefined,
      result: () => undefined,
      argsJson: (callId: string) => callId === 'call-9' ? JSON.stringify({ command: 'npm run build' }) : undefined,
    },
    interactions,
  }
}

describe('app interaction panels', () => {
  it('replaces the input block with the approval panel and restores it after deciding', async () => {
    const bridge = fakeBridge(new InteractionStore())
    const { lastFrame } = render(<App bridge={bridge} />)
    await settle(40)
    const pending = bridge.interactions.pushApproval('bash', 'call-9', 'needs network access')
    await settle()
    let frame = lastFrame() ?? ''
    expect(frame).toContain('needs network access')
    expect(frame).toContain('npm run build')
    expect(frame).toContain('Allow once')
    expect(frame).toContain('Context 0%')
    expect(frame).not.toMatch(/Workspace Write · glm-4\.7-flash/)
    bridge.interactions.settleApproval(
      (bridge.interactions.getSnapshot() as { approval: { id: string } }).approval.id,
      'allowed-once',
    )
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('needs network access')
    expect(frame).toContain('Context 0%')
    await expect(pending).resolves.toBe('allowed-once')
  })

  it('shows the question panel and submits through the store', async () => {
    const bridge = fakeBridge(new InteractionStore())
    const { lastFrame } = render(<App bridge={bridge} />)
    await settle(40)
    const answer = bridge.interactions.pushQuestion({
      questions: [{ id: 'q1', question: 'Proceed with install?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    })
    await settle()
    const snapshot = bridge.interactions.getSnapshot()
    expect(snapshot?.kind).toBe('question')
    const id = snapshot!.question?.id ?? ''
    bridge.interactions.answerQuestion(id, { answers: [{ id: 'q1', selected: ['Yes'] }] })
    await expect(answer).resolves.toEqual({ answers: [{ id: 'q1', selected: ['Yes'] }] })
    await settle()
    expect(lastFrame() ?? '').toContain('Context 0%')
  })
})
