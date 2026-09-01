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

/**
 * Generic tool card: every tool shares one bubble shape. The header carries
 * the tool name plus a parameter summary; the body shows the full arguments
 * and result (or a diff when the tool protocol produced one). No per-tool
 * customization exists at this layer.
 */
export interface ToolCardMessage {
  kind: 'tool-card'
  id: string
  tool: string
  /** Header text: tool name plus optional parameter summary. */
  label: string
  /** Full call-side arguments, rendered verbatim while running (and after, for full disclosure). */
  argsBody: string
  /** Full settled result text from the tool protocol. */
  resultBody?: string
  bodyCol?: number
  diff?: { path: string; hunks: readonly (readonly DiffLine[])[] }
  error?: string
  exitCode?: number
  signal?: string
  running: boolean
  streaming?: boolean
  startedAt?: number
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

export type MessageKind = 'bubble' | 'collapsible' | 'tool-diff' | 'tool-card' | 'compaction' | 'plan' | 'custom'

export type Message = BubbleMessage | CollapsibleMessage | ToolDiffMessage | ToolCardMessage | CompactionMessage | PlanMessage | CustomMessage
