import type { ComponentType, ReactNode, Ref } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface WindowHandle {
  clickAt(y: number, x: number): void
  wheelAt(y: number, dir: -1 | 1): boolean
}

export interface WindowProps {
  open: boolean
  onClose(): void
  handleRef?: Ref<WindowHandle>
}

export interface WindowCommandSpec {
  name: string
  description: string
}

export interface WindowContribution {
  id: string
  title: string
  component: ComponentType<WindowProps>
  order?: number
  command?: WindowCommandSpec
  required?: readonly string[]
}

export interface TuiWindowsFace {
  register(contribution: WindowContribution): () => void
}

export interface StatusLineContribution {
  id: string
  order?: number
  render(props: { columns: number }): string
}

export interface OverlayContribution {
  id: string
  render(props: { onClose(): void }): ReactNode
}

export interface TuiServicesFace {
  register(name: string, service: unknown): () => void
}

export interface PaintArgs<I> {
  item: I
  focused: boolean
  subCol: number
  cursor?: number
  width: number
  y: number
  x: number
  pressed: 'left' | 'right' | null
  clip: number
}

export interface ClickHit {
  localX: number
  localY: number
  width: number
}

export interface ClickActions {
  focus(subCol: number): void
  flash(side: 'left' | 'right'): void
}

export interface WidgetKeyApi {
  cursor: number
  subCol: number
  setCursor(next: number): void
  navigate(direction: 'up' | 'down' | 'left' | 'right'): void
}

export interface WidgetDef<I extends { type: string }> {
  height(item: I, width: number): number
  paintWidth(item: I): number
  render(paint: PaintArgs<I>): ReactNode
  searchTexts?(item: I, searchRight: boolean): string[]
  stops?(item: I): number
  fullRowFocus?: boolean
  selectable?: boolean
  editable?: boolean
  caret?(item: I, cursor: number, width: number): { dy: number; dx: number }
  onLeftRight?(item: I, direction: -1 | 1, api: WidgetKeyApi): boolean
  onEnter?(item: I, api: WidgetKeyApi): boolean
  onSpace?(item: I): void
  onClick?(item: I, hit: ClickHit, actions: ClickActions): boolean
  activate?(item: I): void
}

export interface TuiWidgetsFace {
  register<I extends { type: string }>(type: I['type'], def: WidgetDef<I>): () => void
}

/**
 * Open registry for plugin dialog item kinds. Declaration-merge a property
 * named after your item kind (any key) whose value is the item object type
 * carrying a `type` discriminant; the merged types join the `DialogItem`
 * union so your widget def stays fully typed.
 */
export interface DialogItemKinds {}

export interface ThemePaletteContribution {
  id: string
  order?: number
  /** Which theme mode(s) this palette patch applies to; defaults to 'both'. */
  mode?: 'dark' | 'light' | 'both'
  /** Color name (a `Theme` palette key) to replacement hex/text value. */
  colors: Readonly<Record<string, string>>
}

export interface TuiPaletteFace {
  register(contribution: ThemePaletteContribution): () => void
}

export interface TuiKey {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  home?: boolean
  end?: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean
}

export interface KeyBindingContribution {
  id: string
  order?: number
  /**
   * Invoked for every terminal key event before builtin shell handling.
   * Return true to consume the key; later bindings and builtin handling
   * are skipped for that event.
   */
  handle(input: string, key: TuiKey): boolean
}

export interface TuiKeymapFace {
  register(contribution: KeyBindingContribution): () => void
}

export interface TuiChromeFace {
  statusLine: { register(contribution: StatusLineContribution): () => void }
  overlays: { register(contribution: OverlayContribution): () => void }
  widgets: TuiWidgetsFace
  palette: TuiPaletteFace
  keys: TuiKeymapFace
}

export interface CommandDef {
  id: string
  command: string
  description: string
  hint?: string
  args?: readonly string[]
  run?: () => void
  order?: number
}

export interface TuiCommandsFace {
  register(def: CommandDef): () => void
}

export type DiffLineKind = 'ctx' | 'del' | 'add'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

export type DiffHunk = readonly DiffLine[]

export interface ToolViewDiff {
  path: string
  hunks: readonly DiffHunk[]
}

export interface ToolResultView {
  content: readonly ContentBlock[]
  isError: boolean
  meta?: unknown
}

export interface ToolViewCallContext {
  tool: string
  callId: string
  args: unknown
  argumentsRaw: string
  cwd: string
}

export interface ToolViewResultContext {
  tool: string
  callId: string
  args: unknown
  result: ToolResultView
  cwd: string
}

export interface ToolCallPresentation {
  label?: string
  body?: string
  bodyCol?: number
  diff?: ToolViewDiff
}

export interface ToolResultPresentation {
  kind: 'replace' | 'append'
  text: string
  exitCode?: number
  signal?: string
  bodyCol?: number
  diff?: ToolViewDiff
}

export interface ToolViewContribution {
  tool: string
  order?: number
  call?(context: ToolViewCallContext): ToolCallPresentation | undefined
  result?(context: ToolViewResultContext): ToolResultPresentation | undefined
}

export interface TuiToolsFace {
  register(contribution: ToolViewContribution): () => void
}

export interface CustomMessage {
  kind: 'custom'
  id: string
  view: string
  data: unknown
  running?: boolean
  streaming?: boolean
}

export type CustomMessageSeed = Omit<CustomMessage, 'kind' | 'id'>

export interface ChatNodeDefinition {
  id: string
  order?: number
  match(event: SessionEvent): boolean
  start(event: SessionEvent): CustomMessageSeed
  update?(event: SessionEvent, message: CustomMessage): CustomMessageSeed | null
}

export interface MessageViewContext {
  message: CustomMessage
  width: number
}

export interface MessageViewRender {
  label?: string
  lines: readonly string[]
  wrap?: boolean
  muted?: boolean
}

export interface MessageViewContribution {
  view: string
  order?: number
  render(context: MessageViewContext): MessageViewRender
}

export interface TuiContentFace {
  nodes: { register(definition: ChatNodeDefinition): () => void }
  views: { register(contribution: MessageViewContribution): () => void }
}

export interface TuiStartupSink {
  id: string
  /** Invoked for each boot progress line while the shell is starting. */
  write(line: string): void
}

export interface TuiStartupFace {
  registerSink(sink: TuiStartupSink): () => void
}

export interface InteractionPanelComponentProps {
  request: unknown
  resolve(value: unknown): void
  reject(cause: unknown): void
  active: boolean
  columns: number
  rows: number
  innerWidth: number
  blockWidth: number
  background: string
  handleRef?: { current: unknown }
  onResize(height: number): void
}

export interface InteractionPanelContribution {
  kind: string
  component: ComponentType<InteractionPanelComponentProps>
}

export interface TuiInteractionPanelsFace {
  register(contribution: InteractionPanelContribution): () => void
}

export interface TuiInteractionsFace {
  panels: TuiInteractionPanelsFace
  /** Queue a plugin interaction; resolves when the panel for `kind` settles it. */
  push(kind: string, request: unknown, signal?: AbortSignal): Promise<unknown>
}

export interface TuiSessionSummary {
  id: string
  name: string
  directory: string
  ungrouped: boolean
  updatedAt: number
  modifiedAt?: number
}

export interface TuiChatFace {
  cwd(): string
  activeSessionId(): string
  onEvent(listener: (event: SessionEvent) => void): () => void
  send(text: string): void
  interrupt(): void
  newSession(): Promise<void>
  openSession(id: string): Promise<void>
  listSessions(): Promise<TuiSessionSummary[]>
}

export interface TuiExtensionPoint {
  windows: TuiWindowsFace
  services: TuiServicesFace
  chrome: TuiChromeFace
  commands: TuiCommandsFace
  tools: TuiToolsFace
  content: TuiContentFace
  startup: TuiStartupFace
  interactions?: TuiInteractionsFace
  chat?: TuiChatFace
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tui: TuiExtensionPoint
  }
}
