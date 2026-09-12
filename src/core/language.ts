import { useSyncExternalStore } from 'react'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from '../harness-home.ts'
import { env } from '../env.ts'

export type LanguageId = string
export type LanguageText = Readonly<Partial<Record<LanguageId, string>>>
/** Text that is either language-invariant or carries per-language variants. */
export type LocalizedText = string | LanguageText

const SCHEMA_VERSION = 1
const STORE_DIR = join(resolveDshHome(), 'storages')
const STORE_FILE = join(STORE_DIR, 'dshtui-language.json')

/**
 * Built-in language ids, in presentation order. Plugins may register further
 * ids through `tui.language`; both share one validated id grammar so the
 * store, the resolver, and the window agree on what a language is.
 */
export const BUILTIN_LANGUAGES: readonly LanguageId[] = ['en', 'zh']

const LANGUAGE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,15}$/u

export function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === 'string' && LANGUAGE_ID_PATTERN.test(value)
}

function normalize(value: unknown): LanguageId | undefined {
  return isLanguageId(value) ? value : undefined
}

function languageFromEnv(): LanguageId | undefined {
  const explicit = normalize(env.language)
  if (explicit !== undefined) return explicit
  // Locale strings arrive as `en_US.UTF-8`; only the leading language subtag is considered.
  return normalize(process.env.LANG?.toLowerCase().replace(/[_-].*$/u, ''))
}

function readPersisted(): LanguageId | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const file = parsed as Record<string, unknown>
    return file['version'] === SCHEMA_VERSION ? normalize(file['language']) : undefined
  } catch {
    // A missing, corrupt, or stale-schema file costs the default and nothing else.
    return undefined
  }
}

function writePersisted(language: LanguageId): void {
  const temporary = `${STORE_FILE}.${process.pid}.tmp`
  try {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(temporary, JSON.stringify({ version: SCHEMA_VERSION, language }), { mode: 0o600 })
    renameSync(temporary, STORE_FILE)
  } catch {
    // The in-memory language is already switched; an unwritable store just
    // costs persistence for this run.
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The write failure already decided the outcome; cleanup is best-effort.
    }
  }
}

let current: LanguageId = languageFromEnv() ?? readPersisted() ?? 'en'
const listeners = new Set<() => void>()

export function currentLanguage(): LanguageId {
  return current
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setLanguage(id: LanguageId): void {
  if (!isLanguageId(id)) throw new Error(`invalid language id: ${id}`)
  if (id === current) return
  current = id
  // Only built-in ids persist: a plugin-contributed id may be absent on the
  // next boot, and a stranded persisted id would leave the /language window
  // with no selectable "current" row.
  if (BUILTIN_LANGUAGES.includes(id)) writePersisted(id)
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // One broken subscriber must not starve the others or corrupt the store.
    }
  }
}

export function useLanguage(): LanguageId {
  return useSyncExternalStore(subscribeLanguage, currentLanguage, currentLanguage)
}

/**
 * Resolve localized text against `language`. A plain string is already final;
 * a variant map falls back to the caller's default text, then to the other
 * declared variant. Text that is absent, empty, or maps to nothing resolves to
 * the fallback so callers can measure before they render.
 */
export function localizeText(text: LocalizedText | undefined, fallback: string | undefined, language: LanguageId): string | undefined {
  if (text === undefined) return fallback
  if (typeof text === 'string') return text
  if (Object.keys(text).length === 0) return fallback
  return text[language] ?? fallback ?? Object.values(text)[0]
}
