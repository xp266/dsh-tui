import { useCursor } from 'ink'
import { useCallback } from 'react'

export interface CaretPosition {
  x: number
  y: number
}

/**
 * Ink 7.1.1 rests the hardware cursor one row above where frames without a
 * trailing newline end; this layout fills the viewport, so request one row
 * lower.
 */
export function useCaret(): { setCursorPosition(position: CaretPosition | undefined): void } {
  const { setCursorPosition } = useCursor()
  const adjusted = useCallback((position: CaretPosition | undefined) => {
    if (position === undefined) {
      setCursorPosition(undefined)
      return
    }
    setCursorPosition({ x: position.x, y: position.y + 1 })
  }, [setCursorPosition])
  return { setCursorPosition: adjusted }
}
