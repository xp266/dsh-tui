import { keyedRegistry } from '../kernel/registry.ts'
import type { InteractionPanelComponentProps, InteractionPanelContribution } from '../contract/index.ts'

export type { InteractionPanelComponentProps, InteractionPanelContribution } from '../contract/index.ts'

export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

export interface ApprovalPanelRequest {
  id: string
  toolName: string
  callId?: string
  reason?: string
}

export interface AskOptionLike {
  label: string
  description?: string
}

export interface AskQuestionItemLike {
  id: string
  question: string
  header?: string
  detail?: string
  options?: AskOptionLike[]
  multiSelect?: boolean
  multi_select?: boolean
  intent?: { kind?: string; approve?: string }
}

export interface AskUserQuestionRequestLike {
  questions: AskQuestionItemLike[]
  signal?: AbortSignal
}

export interface AskUserQuestionAnswerItemLike {
  id: string
  selected: string[]
  custom?: string
}

export interface AskUserQuestionAnswerLike {
  answers: AskUserQuestionAnswerItemLike[]
}

export interface QuestionPanelRequest {
  id: string
  request: AskUserQuestionRequestLike
}

/**
 * One pending interaction surfaced to the shell. Built-in kinds carry their
 * typed payload in the documented fields; plugin kinds carry anything in
 * `request` and are rendered by the matching panel contribution.
 */
export interface ActivePanel {
  kind: string
  /** Built-in approval payload (kind === 'approval'). */
  readonly approval?: ApprovalPanelRequest
  /** Built-in question payload (kind === 'question'). */
  readonly question?: QuestionPanelRequest
  /** Plugin-defined payload for contributions registered under `kind`. */
  readonly request?: unknown
  /** Settle a built-in approval. */
  settle?(outcome: ApprovalOutcome | unknown): void
  /** Resolve the interaction with a value (question or plugin kinds). */
  resolve?(value: unknown): void
  /** Reject the interaction; approvals settle as 'cancelled'. */
  reject?(cause: unknown): void
}

interface ApprovalEntry {
  panel: ApprovalPanelRequest
  settle: (value: ApprovalOutcome) => void
  detach: () => void
}

interface QuestionEntry {
  panel: QuestionPanelRequest
  resolve: (answer: AskUserQuestionAnswerLike) => void
  reject: (cause: unknown) => void
  detach: () => void
}

export interface InteractionPanelRequest {
  kind: string
  request: unknown
  resolve(value: unknown): void
  reject(cause: unknown): void
}

export class InteractionPanelRegistry {
  private contributions = keyedRegistry<InteractionPanelContribution>()

  register(contribution: InteractionPanelContribution): () => void {
    return this.contributions.register(contribution.kind, contribution)
  }

  of(kind: string): InteractionPanelContribution | undefined {
    return this.contributions.get(kind)
  }
}

let sequence = 0

function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

function attachAbort(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (signal === undefined) return () => {}
  signal.addEventListener('abort', onAbort, { once: true })
  return () => {
    signal.removeEventListener('abort', onAbort)
  }
}

export class InteractionStore {
  private listeners = new Set<() => void>()
  private approvals: ApprovalEntry[] = []
  private questions: QuestionEntry[] = []
  private generic: Array<{ entry: InteractionPanelRequest; detach: () => void }> = []
  private snapshot: ActivePanel | null = null
  readonly panels = new InteractionPanelRegistry()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): ActivePanel | null => this.snapshot

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private refresh(): void {
    const approval = this.approvals[0]
    if (approval !== undefined) {
      this.snapshot = {
        kind: 'approval',
        approval: approval.panel,
        settle: outcome => {
          this.settleApproval(approval.panel.id, outcome as ApprovalOutcome)
        },
      }
    } else {
      const question = this.questions[0]
      if (question !== undefined) {
        this.snapshot = {
          kind: 'question',
          question: question.panel,
          resolve: answer => {
            this.answerQuestion(question.panel.id, answer as AskUserQuestionAnswerLike)
          },
          reject: cause => {
            this.cancelQuestion(question.panel.id, cause instanceof Error ? cause.message : String(cause))
          },
        }
      } else {
        const generic = this.generic[0]
        this.snapshot = generic === undefined
          ? null
          : { kind: generic.entry.kind, request: generic.entry.request, resolve: generic.entry.resolve, reject: generic.entry.reject }
      }
    }
    this.notify()
  }

  /**
   * Queue a plugin-defined interaction request. A panel contribution for the
   * given kind must exist for the request to render; the returned promise
   * settles when the panel resolves it, or rejects on abort.
   */
  pushRequest(kind: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted === true) return Promise.reject(new Error(`"${kind}" interaction was aborted before the user answered`))
    return new Promise((resolve, reject) => {
      const entry: InteractionPanelRequest = { kind, request, resolve, reject }
      const detach = attachAbort(signal, () => {
        this.cancelRequest(kind, request, `"${kind}" interaction was aborted before the user answered`)
      })
      this.generic.push({ entry, detach })
      this.refresh()
    })
  }

  resolveRequest(kind: string, request: unknown, value: unknown): boolean {
    const index = this.generic.findIndex(slot => slot.entry.kind === kind && slot.entry.request === request)
    if (index < 0) return false
    const [slot] = this.generic.splice(index, 1)
    slot.detach()
    slot.entry.resolve(value)
    this.refresh()
    return true
  }

  cancelRequest(kind: string, request: unknown, message: string): boolean {
    const index = this.generic.findIndex(slot => slot.entry.kind === kind && slot.entry.request === request)
    if (index < 0) return false
    const [slot] = this.generic.splice(index, 1)
    slot.detach()
    slot.entry.reject(new Error(message))
    this.refresh()
    return true
  }

  pushApproval(toolName: string, callId?: string, reason?: string, signal?: AbortSignal): Promise<ApprovalOutcome> {
    if (signal?.aborted === true) return Promise.resolve('cancelled')
    return new Promise(resolve => {
      const panel: ApprovalPanelRequest = {
        id: nextId('approval'),
        toolName,
        ...(callId === undefined ? {} : { callId }),
        ...(reason === undefined ? {} : { reason }),
      }
      const detach = attachAbort(signal, () => {
        this.settleApproval(panel.id, 'cancelled')
      })
      this.approvals.push({ panel, settle: resolve, detach })
      this.refresh()
    })
  }

  settleApproval(id: string, outcome: ApprovalOutcome): boolean {
    const index = this.approvals.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.approvals.splice(index, 1)
    entry.detach()
    entry.settle(outcome)
    this.refresh()
    return true
  }

  pushQuestion(rawRequest: AskUserQuestionRequestLike, signal?: AbortSignal): Promise<AskUserQuestionAnswerLike> {
    const request: AskUserQuestionRequestLike = {
      ...rawRequest,
      questions: rawRequest.questions.map(question => ({
        ...question,
        multiSelect: question.multiSelect ?? question.multi_select,
      })),
    }
    if (request.questions.length === 0) {
      return Promise.reject(new Error('no questions were provided'))
    }
    if (signal?.aborted === true) {
      return Promise.reject(new Error('ask_user_question was aborted before the user answered'))
    }
    return new Promise((resolve, reject) => {
      const panel: QuestionPanelRequest = { id: nextId('question'), request }
      const detach = attachAbort(signal, () => {
        this.cancelQuestion(panel.id, 'ask_user_question was aborted before the user answered')
      })
      this.questions.push({ panel, resolve, reject, detach })
      this.refresh()
    })
  }

  answerQuestion(id: string, answer: AskUserQuestionAnswerLike): boolean {
    const index = this.questions.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.questions.splice(index, 1)
    entry.detach()
    entry.resolve(answer)
    this.refresh()
    return true
  }

  cancelQuestion(id: string, message: string): boolean {
    const index = this.questions.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.questions.splice(index, 1)
    entry.detach()
    entry.reject(new Error(message))
    this.refresh()
    return true
  }

  dispose(): void {
    const approvals = this.approvals.splice(0)
    for (const entry of approvals) {
      entry.detach()
      entry.settle('cancelled')
    }
    const questions = this.questions.splice(0)
    for (const entry of questions) {
      entry.detach()
      entry.reject(new Error('the interaction store was disposed'))
    }
    const generic = this.generic.splice(0)
    for (const slot of generic) {
      slot.detach()
      slot.entry.reject(new Error('the interaction store was disposed'))
    }
    this.refresh()
  }
}

type ApprovalRequestLike = {
  agent: unknown
  toolName: string
  callId?: string
  reason?: string
  signal?: AbortSignal
}

type CtxLike = {
  on(event: 'approval/request', handler: (req: ApprovalRequestLike) => Promise<ApprovalOutcome>): () => void
  get(service: 'userQuestions'): {
    registerProvider(provider: { ask(request: AskUserQuestionRequestLike): Promise<AskUserQuestionAnswerLike> }): () => void
  } | undefined
}

export function registerInteractionChannels(ctx: CtxLike, store: InteractionStore): () => void {
  const offApproval = ctx.on('approval/request', async req => {
    return store.pushApproval(req.toolName, req.callId, req.reason, req.signal)
  })
  const unregisterProvider = ctx.get('userQuestions')?.registerProvider({
    ask(request) {
      return store.pushQuestion(request, request.signal)
    },
  })
  return () => {
    offApproval()
    unregisterProvider?.()
  }
}
