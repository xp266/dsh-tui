import type { CustomMessage, ToolReadView } from '../contract/index.ts'

export type { CustomMessage, ToolReadView } from '../contract/index.ts'

export interface BubbleMessage {
  kind: 'bubble'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  streaming?: boolean
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

/**
 * Generic tool card: every tool shares one bubble shape. The header carries
 * the tool name plus a parameter summary; the body shows the full arguments
 * and result (or a diff / read window when the tool protocol produced one).
 * No per-tool customization exists at this layer.
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
  diff?: { path: string; hunks: readonly (readonly DiffLine[])[]; backgrounds?: boolean }
  /** Structured read window replacing the text result body. */
  read?: ToolReadView
  /** True when the settled result reported isError without a structured error; the result text renders as the error. */
  failed?: boolean
  /** Sub-calls dispatched under this call (code mode); rendered as a child list. */
  nested?: readonly ToolCardMessage[]
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

export type MessageKind = 'bubble' | 'collapsible' | 'tool-card' | 'compaction' | 'custom'

export type Message = BubbleMessage | CollapsibleMessage | ToolCardMessage | CompactionMessage | CustomMessage
