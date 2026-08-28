import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { keyedRegistry } from '../kernel/registry.ts'

export interface StatusLineContribution {
  id: string
  order?: number
  render(props: { columns: number }): string
}

export interface OverlayContribution {
  id: string
  render(props: { onClose(): void }): ReactNode
}

export const statusLines = keyedRegistry<StatusLineContribution>()
export const overlays = keyedRegistry<OverlayContribution>()

export const registerStatusLine = (contribution: StatusLineContribution): (() => void) =>
  statusLines.register(contribution.id, contribution, { order: contribution.order })

export const registerOverlay = (contribution: OverlayContribution): (() => void) =>
  overlays.register(contribution.id, contribution)

let statusVersion = 0
statusLines.subscribe(() => {
  statusVersion += 1
})
let statusCacheVersion = -1
let statusCacheColumns = -1
let statusCacheTexts: string[] = []

export function useStatusLineTexts(columns: number): string[] {
  return useSyncExternalStore(
    statusLines.subscribe,
    () => {
      if (statusCacheVersion !== statusVersion || statusCacheColumns !== columns) {
        statusCacheVersion = statusVersion
        statusCacheColumns = columns
        statusCacheTexts = statusLines.values()
          .map(contribution => contribution.render({ columns }).trim())
          .filter(text => text !== '')
      }
      return statusCacheTexts
    },
    () => [],
  )
}

export function useOverlayContribution(id: string | null): OverlayContribution | undefined {
  return useSyncExternalStore(
    overlays.subscribe,
    () => (id === null ? undefined : overlays.get(id)),
    () => undefined,
  )
}
