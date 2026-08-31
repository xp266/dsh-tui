import { keyedRegistry } from '../kernel/registry.ts'

export interface ClipboardBackendContribution {
  id: string
  order?: number
  /** Read text from the clipboard; return undefined to fall through. */
  readText?(): string | undefined | Promise<string | undefined>
  /** Read an image; return undefined to fall through. */
  readImage?(): { data: Uint8Array; mediaType: string } | undefined | Promise<{ data: Uint8Array; mediaType: string } | undefined>
  /** Write text; return true to stop the write chain. */
  writeText?(text: string): boolean
}

const backends = keyedRegistry<ClipboardBackendContribution>()

/**
 * Plugin clipboard backends run before the builtin platform chain (default
 * order 100 vs builtin 500): a backend that returns undefined lets the next
 * one try. Write chains stop at the first backend that returns true.
 */
export const CLIPBOARD_BUILTIN_ORDER = 500

export function registerClipboardBackend(contribution: ClipboardBackendContribution): () => void {
  return backends.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

export function subscribeClipboardBackends(listener: () => void): () => void {
  return backends.subscribe(listener)
}

export async function clipboardReadText(builtin: () => Promise<string | undefined>): Promise<string | undefined> {
  for (const backend of backends.values()) {
    if (backend.readText === undefined) continue
    try {
      const result = await backend.readText()
      if (result !== undefined) return result
    } catch {
      // fall through to the next backend
    }
  }
  return builtin()
}

export async function clipboardReadImage(
  builtin: () => Promise<{ data: Uint8Array; mediaType: string } | undefined>,
): Promise<{ data: Uint8Array; mediaType: string } | undefined> {
  for (const backend of backends.values()) {
    if (backend.readImage === undefined) continue
    try {
      const result = await backend.readImage()
      if (result !== undefined) return result
    } catch {
      // fall through to the next backend
    }
  }
  return builtin()
}

export function clipboardWriteText(text: string, builtin: (text: string) => void): void {
  for (const backend of backends.values()) {
    if (backend.writeText === undefined) continue
    try {
      if (backend.writeText(text) === true) return
    } catch {
      // fall through to the next backend
    }
  }
  builtin(text)
}
