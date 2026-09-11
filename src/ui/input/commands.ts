import { useSyncExternalStore } from 'react'
import { keyedRegistry } from '../../kernel/registry.ts'
import { localizeText } from '../../core/language.ts'
import { matchHintEntries } from '../chrome/hint-service.ts'
import type { CommandDef } from '../../contract/index.ts'

export type { CommandDef } from '../../contract/index.ts'

export interface CommandHintItem {
  command: string
  description: string
  hint?: string
}

/** Registry-command row as delivered by the bridge (domain `name`, no slash). */
export interface RegistryCommandHint {
  name: string
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

registry.register('new', {
  id: 'new',
  command: '/new',
  description: 'Start a new conversation in current directory',
  descriptions: { zh: '在当前目录开始一个新会话' },
})
registry.register('todo', {
  id: 'todo',
  command: '/todo',
  description: 'Show the current task list',
  descriptions: { zh: '显示当前任务列表' },
})
refresh()
registry.subscribe(refresh)

export function registerCommand(def: CommandDef): () => void {
  if (def.id === '') throw new Error('command id must not be empty')
  if (!def.command.startsWith('/')) throw new Error(`command must start with "/": ${def.command}`)
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

/**
 * Merge local (registered + window) commands with registry commands, resolving
 * every local description against `language`. Local entries always win on a
 * command collision, and registry entries arrive as already-resolved remote
 * rows keyed by `name`.
 */
export function mergeCommandEntries(local: readonly CommandDef[], remote: readonly RegistryCommandHint[], language: string): CommandHintItem[] {
  const taken = new Set(local.map(command => command.command))
  const entries: CommandHintItem[] = local.map(def => {
    const { command, hint } = def
    return {
      command,
      description: localizeText(def.descriptions, def.description, language) ?? def.description,
      ...(hint === undefined ? {} : { hint }),
    }
  })
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
