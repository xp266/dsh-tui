import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export const SpinnerTickContext = createContext(0)

export function useSpinnerTick(): number {
  return useContext(SpinnerTickContext)
}

/**
 * Delivers the busy tick owned by App state. The tick must re-render the whole
 * App, not only its context consumers: ink emits the hardware-cursor suffix
 * only on frames where setCursorPosition ran, so spinner-only frames that skip
 * the composer drop the caret to the frame's bottom row (IME anchors there).
 */
export function SpinnerTickProvider({ tick, children }: { tick: number; children: ReactNode }) {
  return <SpinnerTickContext.Provider value={tick}>{children}</SpinnerTickContext.Provider>
}
