import { keyedRegistry } from '../../kernel/registry.ts'
import type {
  LineSelection,
  SelectionClipboardContribution,
  SelectionDomainContribution,
  SelectionExtractContext,
  SelectionTransformerContribution,
} from '../../contract/index.ts'

export type {
  SelectionClipboardContribution,
  SelectionDomainContribution,
  SelectionExtractContext,
  SelectionTransformerContribution,
} from '../../contract/index.ts'

const domains = keyedRegistry<SelectionDomainContribution>()
const transformers = keyedRegistry<SelectionTransformerContribution>()
const clipboardProviders = keyedRegistry<SelectionClipboardContribution>()

/**
 * Builtin domains sit behind plugin contributions (default order 100): a
 * plugin domain may claim selections first, and a plugin that unmounts
 * hands extraction back to the shell.
 */
const BUILTIN_DOMAIN_ORDER = 500

let installed = false

function installBuiltins(): void {
  if (installed) return
  installed = true
  const messageDomain: SelectionDomainContribution = {
    id: 'builtin.message',
    hit: sel => sel.inMessage,
    extract: (sel, ctx) => ctx.messageText(sel),
  }
  const chromeDomain: SelectionDomainContribution = {
    id: 'builtin.chrome',
    hit: () => true,
    extract: (sel, ctx) => ctx.chromeText(sel),
  }
  const clipboardProvider: SelectionClipboardContribution = {
    id: 'builtin.clipboard',
    copy: text => {
      void import('../../terminal/clipboard.ts').then(({ writeClipboardText }) => writeClipboardText(text))
      return true
    },
  }
  domains.register(messageDomain.id, messageDomain, { order: BUILTIN_DOMAIN_ORDER })
  domains.register(chromeDomain.id, chromeDomain, { order: BUILTIN_DOMAIN_ORDER + 1 })
  clipboardProviders.register(clipboardProvider.id, clipboardProvider, { order: BUILTIN_DOMAIN_ORDER })
}

export function registerSelectionDomain(contribution: SelectionDomainContribution): () => void {
  installBuiltins()
  return domains.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

export function registerSelectionTransformer(contribution: SelectionTransformerContribution): () => void {
  installBuiltins()
  return transformers.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

export function registerSelectionClipboard(contribution: SelectionClipboardContribution): () => void {
  installBuiltins()
  return clipboardProviders.register(contribution.id, contribution, { order: contribution.order ?? 100 })
}

/**
 * Copy pipeline: domain extract -> transformer chain -> clipboard provider
 * chain. Returns the text that was extracted, or null when no domain
 * claimed the selection.
 */
export function copySelection(sel: LineSelection, ctx: SelectionExtractContext): string | null {
  installBuiltins()
  let text: string | null = null
  for (const domain of domains.values()) {
    if (!domain.hit(sel)) continue
    text = domain.extract(sel, ctx)
    break
  }
  if (text === null) return null
  for (const transformer of transformers.values()) {
    text = transformer.transform(text)
  }
  for (const provider of clipboardProviders.values()) {
    if (provider.copy(text)) break
  }
  return text
}
