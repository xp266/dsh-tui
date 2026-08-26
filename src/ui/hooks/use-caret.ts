import { useCursor } from 'ink'
import { useCallback } from 'react'

export interface CaretPosition {
  x: number
  y: number
}

/**
Stock ink 7.1.1 derives the cursor suffix from the visible line count, which
rests the hardware cursor one row above where frames without a trailing
newline actually end; every caret lands a row high. This layout always fills
the viewport (no trailing newline), so compensate by requesting one row lower.
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
