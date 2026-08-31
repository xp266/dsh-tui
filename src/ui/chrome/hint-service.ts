import { keyedRegistry } from '../../kernel/registry.ts'

export interface HintMatchContext {
  /** The raw composer value; always starts with '/' without whitespace. */
  value: string
  /** Value without the leading slash, lowercased. */
  query: string
}

export interface HintMatcherContribution {
  id: string
  order?: number
  /**
   * Filter and rank command hint entries. Return the ordered list to use;
   * return null to fall through to the next matcher (builtin tiers last).
   */
  match(entries: readonly HintEntry[], context: HintMatchContext): HintEntry[] | null
}

export interface HintEntry {
  command: string
  description: string
  hint?: string
}

export interface HintArgsContribution {
  id: string
  order?: number
  /**
   * Provide literal argument completions for a command name (without slash);
   * return null to fall through to the next provider.
   */
  args(name: string): string[] | null | Promise<string[] | null>
}

const matchers = keyedRegistry<HintMatcherContribution>()
const argProviders = keyedRegistry<HintArgsContribution>()

const BUILTIN_ORDER = 500

export function registerHintMatcher(contribution: HintMatcherContribution): () => void {
  return matchers.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

export function registerHintArgsProvider(contribution: HintArgsContribution): () => void {
  return argProviders.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

/** First matcher (by order) that returns a list wins; null falls through. */
export function matchHintEntries(entries: readonly HintEntry[], value: string): HintEntry[] {
  const context: HintMatchContext = { value, query: value.slice(1).toLowerCase() }
  for (const matcher of matchers.values()) {
    const result = matcher.match(entries, context)
    if (result !== null) return result
  }
  return tieredMatch(entries, context.query)
}

/** Builtin three-tier matching: prefix, subsequence, description substring. */
export function tieredMatch(entries: readonly HintEntry[], query: string): HintEntry[] {
  const tiers: HintEntry[][] = [[], [], []]
  for (const entry of entries) {
    const name = entry.command.slice(1).toLowerCase()
    if (name.startsWith(query)) tiers[0]!.push(entry)
    else if (isSubsequence(query, name)) tiers[1]!.push(entry)
    else if (entry.description.toLowerCase().includes(query)) tiers[2]!.push(entry)
  }
  return [...tiers[0]!, ...tiers[1]!, ...tiers[2]!]
}

function isSubsequence(query: string, name: string): boolean {
  let at = 0
  for (const ch of name) {
    if (ch === query[at]) at += 1
    if (at === query.length) return true
  }
  return query.length === 0
}

/** First provider (by order) that returns a non-null list wins. */
export async function hintArgsFor(name: string, builtin: (name: string) => string[]): Promise<string[]> {
  for (const provider of argProviders.values()) {
    const result = await provider.args(name)
    if (result !== null) return result
  }
  return builtin(name)
}
