import type { ComponentType, ReactNode } from 'react'

export interface WindowProps {
  open: boolean
  onClose(): void
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

export interface WindowEntry {
  contribution: WindowContribution
  dispose(): void
}

type Listener = () => void

const registry = new Map<string, WindowEntry>()
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function registerWindow(contribution: WindowContribution): () => void {
  const existing = registry.get(contribution.id)
  if (existing !== undefined) existing.dispose()
  let active = true
  const entry: WindowEntry = {
    contribution,
    dispose() {
      if (!active) return
      active = false
      if (registry.get(contribution.id) === entry) registry.delete(contribution.id)
      notify()
    },
  }
  registry.set(contribution.id, entry)
  notify()
  return () => entry.dispose()
}

export function listWindows(): WindowEntry[] {
  return [...registry.values()].sort((a, b) =>
    (a.contribution.order ?? 100) - (b.contribution.order ?? 100)
    || a.contribution.id.localeCompare(b.contribution.id),
  )
}

export function windowOf(id: string): WindowEntry | undefined {
  return registry.get(id)
}

export function subscribeWindows(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export type WindowView = (props: { id: string; onClose(): void }) => ReactNode
