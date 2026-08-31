import { keyedRegistry } from '../kernel/registry.ts'
import type { KeyBindingContribution, TuiKey } from '../contract/index.ts'

const bindings = keyedRegistry<KeyBindingContribution>()

export function registerKeyBinding(contribution: KeyBindingContribution): () => void {
  return bindings.register(contribution.id, contribution, { order: contribution.order })
}

export function handleKeyContributions(input: string, key: TuiKey): boolean {
  for (const contribution of bindings.values()) {
    if (contribution.handle(input, key) === true) return true
  }
  return false
}
