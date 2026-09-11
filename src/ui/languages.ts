import { keyedRegistry } from '../kernel/registry.ts'
import { BUILTIN_LANGUAGES, isLanguageId } from '../core/language.ts'
import type { LanguageContribution } from '../contract/index.ts'

export type { LanguageContribution } from '../contract/index.ts'

const inner = keyedRegistry<LanguageContribution>()

const BUILTIN_ORDER = 500

for (const [index, id] of BUILTIN_LANGUAGES.entries()) {
  const contribution: LanguageContribution = { id, language: id, label: id === 'zh' ? '简体中文' : 'English', order: BUILTIN_ORDER + index }
  inner.register(id, contribution, { order: contribution.order })
}

export function registerLanguage(contribution: LanguageContribution): () => void {
  if (!isLanguageId(contribution.language)) throw new Error(`invalid language id: ${contribution.language}`)
  return inner.register(contribution.id, contribution, { order: contribution.order })
}

export function listLanguages(): LanguageContribution[] {
  return inner.values()
}

export function subscribeLanguages(listener: () => void): () => void {
  return inner.subscribe(listener)
}

export function hasLanguage(id: string): boolean {
  return inner.values().some(entry => entry.language === id)
}
