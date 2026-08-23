export type BubbleVariant = 'ask-user' | 'todo'

export interface BubbleMessage {
  kind: 'bubble'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  variant?: BubbleVariant
  hang?: number
}

export interface CollapsibleMessage {
  kind: 'collapsible'
  id: string
  label: string
  body: string
  running: boolean
  collapsed: boolean
  bodyCol?: number
  thinking?: boolean
}

export type Message = BubbleMessage | CollapsibleMessage
