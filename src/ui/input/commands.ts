export interface CommandDef {
  command: string
  description: string
}

export const COMMANDS: CommandDef[] = [
  { command: '/models', description: 'Open model selection' },
  { command: '/model-effort', description: 'Select reasoning effort' },
  { command: '/defaults', description: 'Set default permission and agent preset' },
  { command: '/preset', description: 'Select agent preset' },
  { command: '/sessions', description: 'Open session picker' },
  { command: '/new', description: 'Start a new conversation in current directory' },
]

export function filterCommands(value: string): CommandDef[] {
  const token = value.split(/\s+/, 1)[0] ?? ''
  if (!token.startsWith('/')) return []
  return COMMANDS.filter(command => command.command.startsWith(token))
}

export interface CommandHintState {
  commands: CommandDef[]
  selectedIndex: number
  startIndex?: number
}
