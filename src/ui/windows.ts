import { keyedRegistry } from '../kernel/registry.ts'
import type { WindowContribution } from '../contract/index.ts'

export type { WindowCommandSpec, WindowContribution, WindowProps } from '../contract/index.ts'

const inner = keyedRegistry<WindowContribution>()

export function registerWindow(contribution: WindowContribution): () => void {
  return inner.register(contribution.id, contribution, { order: contribution.order })
}

export function listWindows(): WindowContribution[] {
  return inner.values()
}

export function subscribeWindows(listener: () => void): () => void {
  return inner.subscribe(listener)
}
