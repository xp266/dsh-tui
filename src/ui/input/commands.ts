export type CommandId = 'models' | 'model-effort' | 'preset' | 'defaults' | 'sessions' | 'new' | 'todo'

export interface CommandHintItem {
  command: string
  description: string
}

export interface CommandDef extends CommandHintItem {
  id: CommandId
}

export const COMMANDS: CommandDef[] = [
  { id: 'models', command: '/models', description: 'Open model selection' },
  { id: 'model-effort', command: '/model-effort', description: 'Select reasoning effort' },
  { id: 'defaults', command: '/defaults', description: 'Set default permission and agent preset' },
  { id: 'preset', command: '/preset', description: 'Select agent preset' },
  { id: 'sessions', command: '/sessions', description: 'Open session picker' },
  { id: 'new', command: '/new', description: 'Start a new conversation in current directory' },
  { id: 'todo', command: '/todo', description: 'Show the current task list' },
]

export const HINT_COMMAND_COL_WIDTH = 20

export function matchCommand(text: string): CommandDef | undefined {
  return COMMANDS.find(command => command.command === text)
}

export function filterCommands(value: string): CommandDef[] {
  const token = value.split(/\s+/, 1)[0] ?? ''
  if (!token.startsWith('/')) return []
  return COMMANDS.filter(command => command.command.startsWith(token))
}

export interface CommandHintState {
  commands: CommandHintItem[]
  selectedIndex: number
  startIndex?: number
}
