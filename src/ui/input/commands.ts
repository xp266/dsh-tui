import { useSyncExternalStore } from 'react'
import { keyedRegistry } from '../../kernel/registry.ts'
import { matchHintEntries } from '../chrome/hint-service.ts'
import type { CommandDef } from '../../contract/index.ts'

export type { CommandDef } from '../../contract/index.ts'

export type CommandId = string

export interface CommandHintItem {
  command: string
  description: string
  hint?: string
}

const registry = keyedRegistry<CommandDef>()

export const COMMANDS: CommandDef[] = []

let version = 0

function refresh(): void {
  version += 1
  COMMANDS.length = 0
  COMMANDS.push(...registry.values())
}

registry.register('new', { id: 'new', command: '/new', description: 'Start a new conversation in current directory' })
registry.register('todo', { id: 'todo', command: '/todo', description: 'Show the current task list' })
refresh()
registry.subscribe(refresh)

export function registerCommand(def: CommandDef): () => void {
  return registry.register(def.id, def, { order: def.order })
}

export function subscribeCommands(listener: () => void): () => void {
  return registry.subscribe(listener)
}

export function useCommandVersion(): number {
  return useSyncExternalStore(subscribeCommands, () => version, () => version)
}

export function matchCommand(text: string): CommandDef | undefined {
  return registry.values().find(command => command.command === text)
}

export type CommandAvailability = (command: CommandDef) => boolean

export function matchAvailableCommand(text: string, isAvailable?: CommandAvailability, extra?: readonly CommandDef[]): CommandDef | undefined {
  const token = text.split(/\s+/, 1)[0] ?? ''
  const command = [...registry.values(), ...extra ?? []].find(entry => entry.command === token)
  if (command === undefined) return undefined
  if (isAvailable !== undefined && !isAvailable(command)) return undefined
  return command
}

export function commandArgHints(name: string): readonly string[] | undefined {
  const def = registry.values().find(candidate => candidate.command === `/${name}`)
  return def?.args
}

export function mergeCommandEntries(
  local: CommandDef[],
  remote: readonly { name: string; description: string; hint?: string }[],
): CommandHintItem[] {
  const taken = new Set(local.map(command => command.command))
  const entries: CommandHintItem[] = local.map(({ command, description, hint }) => ({
    command,
    description,
    ...(hint === undefined ? {} : { hint }),
  }))
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

export function filterHintEntries(entries: readonly CommandHintItem[], value: string): CommandHintItem[] {
  if (!value.startsWith('/') || /\s/.test(value)) return []
  return matchHintEntries(entries, value)
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
