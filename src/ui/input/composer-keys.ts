import { keyedRegistry } from '../../kernel/registry.ts'
import type { TuiKey } from '../../contract/index.ts'

export interface ComposerKeyBinding {
  id: string
  order?: number
  handle(input: string, key: TuiKey): boolean
}

const bindings = keyedRegistry<ComposerKeyBinding>()

export function registerComposerKeyBinding(binding: ComposerKeyBinding): () => void {
  return bindings.register(binding.id, binding, { order: binding.order })
}

export function handleComposerKeyBindings(input: string, key: TuiKey): boolean {
  for (const binding of bindings.values()) {
    if (binding.handle(input, key) === true) return true
  }
  return false
}
