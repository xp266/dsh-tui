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
  /** Parameter tokens advertised by the command, if any. */
  args?: HintToken[]
  /** Raw hint string, retained for literal argument completion fallback. */
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
    // The strip shows the parsed `hint`; an explicit `args` list (used for Tab
    // completion) stands in as literal tokens when there is no hint.
    const parsed = parseHintTokens(def.hint)
    const args = parsed.length > 0 ? parsed : (def.args ?? []).map(label => ({ label, literal: true }))
    entries.push({
      command: def.command,
      description: localizeText(def.descriptions, def.description, language) ?? def.description,
      ...(args.length === 0 ? {} : { args }),
      ...(def.hint === undefined ? {} : { hint: def.hint }),
    })
  }
  for (const entry of remote) {
    const command = `/${entry.name}`
    if (taken.has(command)) continue
    taken.add(command)
    const args = parseHintTokens(entry.hint)
    entries.push({
      command,
      description: entry.description,
      ...(args.length === 0 ? {} : { args }),
      ...(entry.hint === undefined ? {} : { hint: entry.hint }),
    })
  }
  return entries
}

export function filterHintEntries(entries: readonly CommandHintItem[], value: string): CommandHintItem[] {
  if (!value.startsWith('/') || /\s/.test(value)) return []
  return matchHintEntries(entries, value)
}

/** One parsed parameter token from a command hint: a literal choice or a free-form placeholder. */
export interface HintToken {
  /** Token text without any surrounding `<>`/`[]`/`()` marker. */
  label: string
  /** Placeholder (`<text>`) vs a concrete literal choice (`off`). */
  literal: boolean
}

/**
 * Split a raw hint into parameter tokens.
 *
 * Upstream hints are free-form strings; the shapes seen in practice are
 * `[off|message]`, `[<objective>|clear|edit <objective>|pause|resume]`,
 * `<text>`, and prose such as `text to echo`. A bracket group splits on `|` and
 * nothing else, so a multi-word option stays whole (`edit <objective>` is one
 * choice that itself takes an objective). A hint with no brackets is a single
 * token. Only a token wrapped entirely in `<>` is a placeholder. Duplicates
 * collapse, first occurrence wins.
 */
export function parseHintTokens(hint: string | undefined): HintToken[] {
  if (hint === undefined) return []
  const trimmed = hint.trim()
  if (trimmed === '') return []
  const inner = /^\[([\s\S]*)\]$/u.exec(trimmed)?.[1]
  const parts = (inner ?? trimmed).split('|')
  const tokens: HintToken[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const label = part.trim()
    if (label === '') continue
    const placeholder = /^<([^<>]+)>$/u.exec(label)
    const token: HintToken = placeholder === null ? { label, literal: true } : { label: placeholder[1]!, literal: false }
    const key = `${token.literal ? 'l' : 'p'}:${token.label}`
    if (seen.has(key)) continue
    seen.add(key)
    tokens.push(token)
  }
  return tokens
}

/** Static literal arguments for registry commands whose hints mix literals with free-form prose. */
export const KNOWN_COMMAND_ARGS: Record<string, readonly string[]> = {
  plan: ['off'],
}

/** Leading word of a token: `edit` for the mixed option `edit <objective>`. */
function leadingWord(label: string): string {
  return label.split(/\s+/, 1)[0] ?? ''
}

/**
 * Completion candidates for a command's arguments. A hint option may be a
 * keyword plus its own free-form placeholder (`edit <objective>`); only the
 * keyword is a literal choice, so completion inserts `edit` and whatever the
 * option takes is typed (or completed) afterwards. Falling back to the whole
 * label would paste the placeholder text itself and then keep offering it.
 */
export function literalHintArgs(hint: string | undefined): string[] {
  const seen = new Set<string>()
  const args: string[] = []
  for (const token of parseHintTokens(hint)) {
    if (!token.literal) continue
    const word = leadingWord(token.label)
    if (word === '' || seen.has(word)) continue
    seen.add(word)
    args.push(word)
  }
  return args
}

/**
 * Parameter strip for a typed command line: resolves the leading command token
 * against `entries` and returns its tokens when the line has moved past the
 * command name (`/goal ` or `/goal o`). Returns undefined while the user is
 * still picking the command itself, so the command menu owns that state.
 */
export function commandHintArgs(entries: readonly CommandHintItem[], value: string): CommandHintArgs | undefined {
  const match = /^(\/\S+)(?:\s+([\s\S]*))?$/u.exec(value)
  if (match === null) return undefined
  const command = match[1]!
  if (match[2] === undefined) return undefined
  const entry = entries.find(candidate => candidate.command === command)
  if (entry === undefined || entry.args === undefined || entry.args.length === 0) return undefined
  return { command, tokens: entry.args }
}

export interface CommandHintState {
  commands: CommandHintItem[]
  selectedIndex: number
  startIndex?: number
  /** Widest command name across the full filtered list, for a stable label column. */
  nameWidth?: number
}

/**
 * The candidate one Tab press moves to, cycling through the list. A full match
 * advances to the next candidate; a partial one jumps to the first prefix match,
 * or to the head when nothing matches.
 */
export function nextHintCompletion(candidates: readonly string[], current: string): string | undefined {
  if (candidates.length === 0) return undefined
  const exactIndex = candidates.indexOf(current)
  if (exactIndex >= 0) return candidates[(exactIndex + 1) % candidates.length]
  return candidates.find(candidate => candidate.startsWith(current)) ?? candidates[0]
}

/**
 * The parameter strip shown under the composer once a command with parameters
 * is typed out (`/goal `). `tokens` are its columns.
 */
export interface CommandHintArgs {
  command: string
  tokens: HintToken[]
}
