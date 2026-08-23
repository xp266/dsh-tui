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

export type ActivePanel =
  | { kind: 'approval'; approval: ApprovalPanelRequest }
  | { kind: 'question'; question: QuestionPanelRequest }
  | null

interface ApprovalEntry {
  panel: ApprovalPanelRequest
  settle: (value: ApprovalOutcome) => void
}

interface QuestionEntry {
  panel: QuestionPanelRequest
  resolve: (answer: AskUserQuestionAnswerLike) => void
  reject: (cause: unknown) => void
}

let sequence = 0

function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

export class InteractionStore {
  private listeners = new Set<() => void>()
  private approvals: ApprovalEntry[] = []
  private questions: QuestionEntry[] = []
  private snapshot: ActivePanel = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): ActivePanel => this.snapshot

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private refresh(): void {
    const approval = this.approvals[0]
    if (approval !== undefined) {
      this.snapshot = { kind: 'approval', approval: approval.panel }
    } else {
      const question = this.questions[0]
      this.snapshot = question === undefined ? null : { kind: 'question', question: question.panel }
    }
    this.notify()
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
      const onAbort = (): void => {
        this.settleApproval(panel.id, 'cancelled')
      }
      this.approvals.push({ panel, settle: resolve })
      signal?.addEventListener('abort', onAbort, { once: true })
      this.refresh()
    })
  }

  settleApproval(id: string, outcome: ApprovalOutcome): boolean {
    const index = this.approvals.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.approvals.splice(index, 1)
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
      const onAbort = (): void => {
        this.cancelQuestion(panel.id, 'ask_user_question was aborted before the user answered')
      }
      this.questions.push({ panel, resolve, reject })
      signal?.addEventListener('abort', onAbort, { once: true })
      this.refresh()
    })
  }

  answerQuestion(id: string, answer: AskUserQuestionAnswerLike): boolean {
    const index = this.questions.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.questions.splice(index, 1)
    entry.resolve(answer)
    this.refresh()
    return true
  }

  cancelQuestion(id: string, message: string): boolean {
    const index = this.questions.findIndex(entry => entry.panel.id === id)
    if (index < 0) return false
    const [entry] = this.questions.splice(index, 1)
    entry.reject(new Error(message))
    this.refresh()
    return true
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
  on(event: 'approval/request', handler: (req: ApprovalRequestLike) => Promise<ApprovalOutcome>): unknown
  get(service: 'userQuestions'): {
    registerProvider(provider: { ask(request: AskUserQuestionRequestLike): Promise<AskUserQuestionAnswerLike> }): () => void
  } | undefined
}

export function registerInteractionChannels(ctx: CtxLike, store: InteractionStore): void {
  ctx.on('approval/request', async req => {
    return store.pushApproval(req.toolName, req.callId, req.reason, req.signal)
  })
  ctx.get('userQuestions')?.registerProvider({
    ask(request) {
      return store.pushQuestion(request, request.signal)
    },
  })
}
