import type { ComponentType, Ref } from 'react'
import { keyedRegistry } from '../kernel/registry.ts'
import type { DialogHandle } from './dialog/dialog.tsx'

export interface WindowProps {
  open: boolean
  onClose(): void
  handleRef?: Ref<DialogHandle>
}

export interface WindowCommandSpec {
  name: string
  description: string
}

export interface WindowContribution {
  id: string
  title: string
  component: ComponentType<WindowProps>
  order?: number
  command?: WindowCommandSpec
  required?: readonly string[]
}

const inner = keyedRegistry<WindowContribution>()

export function registerWindow(contribution: WindowContribution): () => void {
  return inner.register(contribution.id, contribution, { order: contribution.order })
}

export function listWindows(): WindowContribution[] {
  return inner.values()
}

export function windowOf(id: string): WindowContribution | undefined {
  return inner.get(id)
}

export function subscribeWindows(listener: () => void): () => void {
  return inner.subscribe(listener)
}
