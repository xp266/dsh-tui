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

export type CommandAvailability = (command: CommandDef) => boolean

export function visibleCommands(value: string, isAvailable?: CommandAvailability): CommandDef[] {
  const matches = filterCommands(value)
  if (isAvailable === undefined) return matches
  return matches.filter(isAvailable)
}

export function matchAvailableCommand(text: string, isAvailable?: CommandAvailability): CommandDef | undefined {
  const command = matchCommand(text)
  if (command === undefined) return undefined
  if (isAvailable !== undefined && !isAvailable(command)) return undefined
  return command
}

export function mergeCommandEntries(
  local: CommandDef[],
  remote: readonly { name: string; description: string }[],
): CommandHintItem[] {
  const taken = new Set(local.map(command => command.command))
  const entries: CommandHintItem[] = local.map(({ command, description }) => ({ command, description }))
  for (const entry of remote) {
    const command = `/${entry.name}`
    if (taken.has(command)) continue
    taken.add(command)
    entries.push({ command, description: entry.description })
  }
  return entries
}

export function filterHintEntries(entries: readonly CommandHintItem[], value: string): CommandHintItem[] {
  const token = value.split(/\s+/, 1)[0] ?? ''
  if (!token.startsWith('/')) return []
  return entries.filter(entry => entry.command.startsWith(token))
}

export interface CommandHintState {
  commands: CommandHintItem[]
  selectedIndex: number
  startIndex?: number
}
