export type BubbleVariant = 'ask-user' | 'todo'

export interface BubbleMessage {
  kind: 'bubble'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  variant?: BubbleVariant
  hang?: number
  streaming?: boolean
  pending?: boolean
  origin?: 'command'
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
  startedAt?: number
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
  streamText?: string
}

export interface CompactionMessage {
  kind: 'compaction'
  id: string
  compactionId: string
  running: boolean
  summary: string
  error?: string
}

export interface PlanMessage {
  kind: 'plan'
  id: string
  body: string
  running?: boolean
  streaming?: boolean
  error?: string
}

import type { CustomMessage } from '../contract/index.ts'

export type { CustomMessage } from '../contract/index.ts'

export type MessageKind = 'bubble' | 'collapsible' | 'tool-diff' | 'compaction' | 'plan' | 'custom'

export type Message = BubbleMessage | CollapsibleMessage | ToolDiffMessage | CompactionMessage | PlanMessage | CustomMessage
