import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const SpinnerTickContext = createContext(0)

export function useSpinnerTick(): number {
  return useContext(SpinnerTickContext)
}

/**
 * Owns the 10Hz busy animation tick. Keeping the tick in context instead of
 * App state confines each tick to the components that consume it (spinner
 * rows, status bar); the rest of the App tree does not re-render.
 */
export function SpinnerTickProvider({ busy, children }: { busy: boolean; children: ReactNode }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!busy) return
    setTick(0)
    const timer = setInterval(() => setTick(tick => tick + 1), 100)
    return () => clearInterval(timer)
  }, [busy])
  return <SpinnerTickContext.Provider value={busy ? tick : 0}>{children}</SpinnerTickContext.Provider>
}
