export type CommandId = string

export interface CommandHintItem {
  command: string
  description: string
  hint?: string
}

export interface CommandDef extends CommandHintItem {
  id: CommandId
}

export const COMMANDS: CommandDef[] = [
  { id: 'new', command: '/new', description: 'Start a new conversation in current directory' },
  { id: 'todo', command: '/todo', description: 'Show the current task list' },
]

export function matchCommand(text: string): CommandDef | undefined {
  return COMMANDS.find(command => command.command === text)
}

export type CommandAvailability = (command: CommandDef) => boolean

export function matchAvailableCommand(text: string, isAvailable?: CommandAvailability, extra?: readonly CommandDef[]): CommandDef | undefined {
  const token = text.split(/\s+/, 1)[0] ?? ''
  const command = [...COMMANDS, ...extra ?? []].find(entry => entry.command === token)
  if (command === undefined) return undefined
  if (isAvailable !== undefined && !isAvailable(command)) return undefined
  return command
}

export function mergeCommandEntries(
  local: CommandDef[],
  remote: readonly { name: string; description: string; hint?: string }[],
): CommandHintItem[] {
  const taken = new Set(local.map(command => command.command))
  const entries: CommandHintItem[] = local.map(({ command, description }) => ({ command, description }))
  for (const entry of remote) {
    const command = `/${entry.name}`
    if (taken.has(command)) continue
    taken.add(command)
    entries.push({
      command,
      description: entry.description,
      ...(entry.hint === undefined ? {} : { hint: entry.hint }),
    })
  }
  return entries
}

function isSubsequence(query: string, text: string): boolean {
  let at = 0
  for (let index = 0; index < text.length && at < query.length; index++) {
    if (text[index] === query[at]) at += 1
  }
  return at === query.length
}

function matchTier(entry: CommandHintItem, query: string): 0 | 1 | 2 | undefined {
  const name = entry.command.slice(1).toLowerCase()
  if (name.startsWith(query)) return 0
  if (isSubsequence(query, name)) return 1
  if (entry.description.toLowerCase().includes(query)) return 2
  return undefined
}

export function filterHintEntries(entries: readonly CommandHintItem[], value: string): CommandHintItem[] {
  if (!value.startsWith('/') || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()
  const tiers: CommandHintItem[][] = [[], [], []]
  for (const entry of entries) {
    const tier = matchTier(entry, query)
    if (tier !== undefined) tiers[tier].push(entry)
  }
  return [...tiers[0], ...tiers[1], ...tiers[2]]
}

/** Static literal arguments for registry commands whose hints mix literals with free-form prose. */
export const KNOWN_COMMAND_ARGS: Record<string, readonly string[]> = {
  plan: ['off'],
}

export function literalHintArgs(hint: string | undefined): string[] {
  if (hint === undefined || hint === '') return []
  const body = hint.replace(/^\[/, '').replace(/\]$/, '')
  return body
    .split('|')
    .map(part => part.trim())
    .filter(part => part !== '' && !part.includes('<'))
}

export interface CommandHintState {
  commands: CommandHintItem[]
  selectedIndex: number
  startIndex?: number
}
