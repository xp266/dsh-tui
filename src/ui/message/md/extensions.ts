import { keyedRegistry } from '../../../kernel/registry.ts'
import Prism from 'prismjs'
import type { MarkdownBlockContribution, MarkdownInlineContribution, PrismGrammarContribution } from '../../../contract/index.ts'

const blocks = keyedRegistry<MarkdownBlockContribution>()
const inline = keyedRegistry<MarkdownInlineContribution>()
const languages = keyedRegistry<PrismGrammarContribution>()

export function registerMarkdownBlock(contribution: MarkdownBlockContribution): () => void {
  return blocks.register(contribution.type, contribution, { order: contribution.order })
}

export function registerMarkdownInline(contribution: MarkdownInlineContribution): () => void {
  return inline.register(contribution.type, contribution, { order: contribution.order })
}

export function registerPrismGrammar(contribution: PrismGrammarContribution): () => void {
  const dispose = languages.register(contribution.id, contribution)
  const touched = applyPrismGrammar(contribution)
  return () => {
    dispose()
    revertPrismGrammar(touched)
  }
}

export function subscribeMarkdownBlocks(listener: () => void): () => void {
  return blocks.subscribe(listener)
}

export function subscribeMarkdownInlines(listener: () => void): () => void {
  return inline.subscribe(listener)
}

function markdownBlockOf(token: { type: string }) {
  return blocks.get(token.type)
}

function markdownInlineOf(token: { type: string }) {
  return inline.get(token.type)
}

export const markdownExtensions = { markdownBlockOf, markdownInlineOf }

function applyPrismGrammar(contribution: PrismGrammarContribution): string[] {
  const prism = Prism as unknown as { languages: Record<string, unknown> }
  const touched = [contribution.id, ...(contribution.aliases ?? [])]
  for (const name of touched) prism.languages[name] = contribution.grammar
  return touched
}

function revertPrismGrammar(names: string[]): void {
  const prism = Prism as unknown as { languages: Record<string, unknown> }
  for (const name of names) delete prism.languages[name]
}
