import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

export interface Origin {
  x: number
  y: number
}

export interface Rect extends Origin {
  width: number
  height: number
}

export const ZERO_ORIGIN: Origin = { x: 0, y: 0 }

export const RegionContext = createContext<Origin>(ZERO_ORIGIN)

export function useOrigin(): Origin {
  return useContext(RegionContext)
}

export function translate(parent: Origin, x: number, y: number): Origin {
  return { x: parent.x + x, y: parent.y + y }
}

export interface RegionProps {
  x?: number
  y?: number
  children: ReactNode
}

export function Region({ x = 0, y = 0, children }: RegionProps) {
  const parent = useOrigin()
  const value = useMemo(() => translate(parent, x, y), [parent.x, parent.y, x, y])
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
}
