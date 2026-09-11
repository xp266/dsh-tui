import { useSyncExternalStore } from 'react'
import { keyedRegistry } from '../../kernel/registry.ts'
import { localizeText } from '../../core/language.ts'
import { matchHintEntries } from '../chrome/hint-service.ts'
import { warn } from '../../log.ts'
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

/** Command-name grammar shared by registration validation and unknown-command detection. */
export const COMMAND_NAME_PATTERN = /^\/[a-z][a-z0-9-]*$/u

let version = 0
let diagnostics: readonly string[] = []

function refresh(): void {
  version += 1
  const seen = new Map<string, string>()
  const conflicts: string[] = []
  const accepted: CommandDef[] = []
  // First entry wins by registry order; a later command claiming a token that
  // already resolved would render a duplicate row and shadow-dispatch, so it is
  // dropped and recorded instead of quietly duplicating.
  for (const def of registry.values()) {
    const owner = seen.get(def.command)
    if (owner !== undefined) {
      conflicts.push(`command "${def.command}" from "${def.id}" conflicts with "${owner}" and is ignored`)
      continue
    }
    seen.set(def.command, def.id)
    accepted.push(def)
  }
  COMMANDS.length = 0
  COMMANDS.push(...accepted)
  diagnostics = conflicts
  for (const conflict of conflicts) warn('commands', conflict)
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
  if (!COMMAND_NAME_PATTERN.test(def.command)) {
    throw new Error(`invalid command name "${def.command}": must match ${COMMAND_NAME_PATTERN.source}`)
  }
  return registry.register(def.id, def, { order: def.order })
}

/** Conflicting local command registrations dropped by the last refresh. */
export function commandDiagnostics(): readonly string[] {
  return diagnostics
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
  const taken = new Set<string>()
  const entries: CommandHintItem[] = []
  for (const def of local) {
    if (taken.has(def.command)) continue
    taken.add(def.command)
    entries.push({
      command: def.command,
      description: localizeText(def.descriptions, def.description, language) ?? def.description,
      ...(def.hint === undefined ? {} : { hint: def.hint }),
    })
  }
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
