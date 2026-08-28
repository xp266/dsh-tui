import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { InteractionStore } from '../src/chat/interactions.ts'
import { createFakeBridge } from './helpers/fake-bridge.ts'

async function settle(ms = 25): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function fakeBridge(interactions: InteractionStore): ChatBridge {
  return createFakeBridge({
    interactions,
    toolPresenter: {
      call: () => undefined,
      result: () => undefined,
      argsJson: (callId: string) => callId === 'call-9' ? JSON.stringify({ command: 'npm run build' }) : undefined,
    },
  })
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
