export type BubbleVariant = 'ask-user' | 'todo'

export interface BubbleMessage {
  kind: 'bubble'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  variant?: BubbleVariant
  hang?: number
  streaming?: boolean
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
  streaming?: boolean
}

export type DiffLineKind = 'ctx' | 'del' | 'add'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

export interface ToolDiffMessage {
  kind: 'tool-diff'
  id: string
  tool: string
  path: string
  hunks: readonly (readonly DiffLine[])[]
  error?: string
  streaming?: boolean
  running?: boolean
}

export interface CompactionMessage {
  kind: 'compaction'
  id: string
  compactionId: string
  running: boolean
  summary: string
  error?: string
}

export type Message = BubbleMessage | CollapsibleMessage | ToolDiffMessage | CompactionMessage
