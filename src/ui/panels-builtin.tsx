import type { ComponentType } from 'react'
import { ApprovalPanel } from './panels/approval-panel.tsx'
import type { ApprovalPanelProps } from './panels/approval-panel.tsx'
import { QuestionPanel } from './panels/question-panel.tsx'
import type { QuestionPanelProps } from './panels/question-panel.tsx'
import type { InteractionPanelComponentProps, InteractionPanelContribution } from '../chat/interactions.ts'
import type { ChatBridge } from '../chat/bridge.ts'

export interface PanelServices {
  bridge: ChatBridge
}

function adapt<P extends object>(Component: ComponentType<P>, map: (props: InteractionPanelComponentProps) => Omit<P, 'handleRef'> | null): ComponentType<InteractionPanelComponentProps> {
  const Wrapped = (props: InteractionPanelComponentProps) => {
    const adapted = map(props)
    if (adapted === null) return null
    const Specific = Component as ComponentType<Record<string, unknown>>
    return <Specific {...(adapted as Record<string, unknown>)} handleRef={props.handleRef} />
  }
  return Wrapped
}

export function registerBuiltinPanels(services: PanelServices): () => void {
  const { bridge } = services
  const contributions: InteractionPanelContribution[] = [
    {
      kind: 'approval',
      component: adapt<ApprovalPanelProps>(ApprovalPanel, props => {
        const approval = (props.request as { approval?: { reason?: string; callId?: string } }).approval
        if (approval === undefined) return null
        return {
          reason: approval.reason,
          command: approval.callId === undefined ? undefined : commandForCall(bridge, approval.callId),
          background: props.background,
          active: props.active,
          columns: props.columns,
          rows: props.rows,
          innerWidth: props.innerWidth,
          blockWidth: props.blockWidth,
          onDecide: (outcome: 'allowed-once' | 'rejected') => props.resolve(outcome),
          onResize: props.onResize,
        }      }),
    },
    {
      kind: 'question',
      component: adapt<QuestionPanelProps>(QuestionPanel, props => {
        const question = (props.request as { question?: QuestionPanelProps['question'] }).question
        if (question === undefined) return null
        return {
          question,
          background: props.background,
          active: props.active,
          columns: props.columns,
          rows: props.rows,
          innerWidth: props.innerWidth,
          blockWidth: props.blockWidth,
          onSubmit: (answer: Parameters<QuestionPanelProps['onSubmit']>[0]) => props.resolve(answer),
          onCancel: () => props.reject(new Error('the user closed the question panel')),
          onResize: props.onResize,
        }
      }),
    },
  ]
  const disposers = contributions.map(contribution => services.bridge.interactions.panels.register(contribution))
  return () => {
    for (const dispose of disposers) dispose()
  }
}

function commandForCall(bridge: ChatBridge, callId: string): string | undefined {
  try {
    const args = JSON.parse(bridge.toolPresenter.argsJson(callId) ?? 'null') as { command?: unknown } | null
    return typeof args?.command === 'string' && args.command !== '' ? args.command : undefined
  } catch {
    return undefined
  }
}
