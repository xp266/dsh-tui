export interface BubbleMessage {
  kind: 'bubble'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
}

export interface CollapsibleMessage {
  kind: 'collapsible'
  id: string
  label: string
  body: string
  running: boolean
  collapsed: boolean
  bodyCol?: number
}

export type Message = BubbleMessage | CollapsibleMessage
