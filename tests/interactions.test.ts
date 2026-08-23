import { describe, expect, it } from 'vitest'
import { InteractionStore } from '../src/chat/interactions.ts'

function deferredApprovalId(store: InteractionStore): string {
  const snapshot = store.getSnapshot()
  return snapshot !== null && snapshot.kind === 'approval' ? snapshot.approval.id : ''
}

function snapshotQuestionId(store: InteractionStore): string {
  const snapshot = store.getSnapshot()
  return snapshot !== null && snapshot.kind === 'question' ? snapshot.question.id : ''
}

describe('interaction store', () => {
  it('surfaces the pushed approval and settles it with the chosen outcome', async () => {
    const store = new InteractionStore()
    const pending = store.pushApproval('bash', 'call-1', 'need network')
    expect(store.getSnapshot()).toMatchObject({ kind: 'approval', approval: { toolName: 'bash', callId: 'call-1', reason: 'need network' } })
    const snapshot = store.getSnapshot()
    expect(snapshot?.kind).toBe('approval')
    const id = snapshot!.kind === 'approval' ? snapshot!.approval.id : ''
    expect(store.settleApproval(id, 'rejected')).toBe(true)
    await expect(pending).resolves.toBe('rejected')
    expect(store.getSnapshot()).toBeNull()
  })

  it('queues approvals fifo and reveals the next one after a decision', async () => {
    const store = new InteractionStore()
    const first = store.pushApproval('bash')
    const second = store.pushApproval('edit')
    expect(store.getSnapshot()).toMatchObject({ approval: { toolName: 'bash' } })
    store.settleApproval(deferredApprovalId(store), 'allowed-once')
    await expect(first).resolves.toBe('allowed-once')
    expect(store.getSnapshot()).toMatchObject({ approval: { toolName: 'edit' } })
    store.settleApproval(deferredApprovalId(store), 'rejected')
    await expect(second).resolves.toBe('rejected')
    expect(store.getSnapshot()).toBeNull()
  })

  it('settles an aborted approval as cancelled without user action', async () => {
    const store = new InteractionStore()
    const controller = new AbortController()
    const pending = store.pushApproval('bash', undefined, undefined, controller.signal)
    controller.abort()
    await expect(pending).resolves.toBe('cancelled')
    expect(store.getSnapshot()).toBeNull()
  })

  it('shows questions only when no approval is pending and resolves answers', async () => {
    const store = new InteractionStore()
    void store.pushApproval('bash')
    const answer = store.pushQuestion({
      questions: [{ id: 'q1', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }],
    })
    expect(store.getSnapshot()).toMatchObject({ kind: 'approval' })
    store.settleApproval(deferredApprovalId(store), 'allowed-once')
    expect(store.getSnapshot()).toMatchObject({ kind: 'question' })
    const questionId = snapshotQuestionId(store)
    store.answerQuestion(questionId, { answers: [{ id: 'q1', selected: ['B'] }] })
    await expect(answer).resolves.toEqual({ answers: [{ id: 'q1', selected: ['B'] }] })
    expect(store.getSnapshot()).toBeNull()
  })

  it('rejects a cancelled question with an error', async () => {
    const store = new InteractionStore()
    const pending = store.pushQuestion({ questions: [{ id: 'q1', question: 'Why?' }] })
    const id = snapshotQuestionId(store)
    store.cancelQuestion(id, 'the user closed the question panel')
    await expect(pending).rejects.toThrow('the user closed the question panel')
  })

  it('normalizes snake_case multi_select into multiSelect', () => {
    const store = new InteractionStore()
    void store.pushQuestion({
      questions: [{ id: 'q1', question: 'Pick', options: [{ label: 'A' }], multi_select: true }],
    })
    const snapshot = store.getSnapshot()
    expect(snapshot?.kind).toBe('question')
    const question = snapshot!.kind === 'question' ? snapshot!.question.request.questions[0]! : undefined
    expect(question?.multiSelect).toBe(true)
  })

  it('aborts a pending question when the turn signal fires', async () => {
    const store = new InteractionStore()
    const controller = new AbortController()
    const pending = store.pushQuestion({ questions: [{ id: 'q1', question: 'Why?' }] }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
  })
})
