import { Box, Text } from 'ink'
import { useSyncExternalStore } from 'react'
import { bootSnapshot, subscribeBoot } from '../boot-log.ts'
import { glyphs } from '../terminal/glyphs.ts'
import { COLORS } from '../theme.ts'

let sessionDismissed = false

/**
 * One-time strip state: read straight from the boot snapshot via the same
 * store the boot screen subscribes to. Dismissal is session-scoped module
 * state; a fresh boot re-raises the warnings.
 */
export function BootWarningStrip(): React.JSX.Element | null {
  const boot = useSyncExternalStore(subscribeBoot, bootSnapshot, bootSnapshot)
  if (sessionDismissed) return null
  const pending = boot.warnings
  if (pending.length === 0) return null
  return (
    <Box flexDirection="column">
      {pending.map(warning => (
        <Box key={warning.id} paddingLeft={1}>
          <Text color={COLORS.warning}>
            {glyphs.bullets[0]} {warning.text}
          </Text>
        </Box>
      ))}
      <Box paddingLeft={2}>
        <Text dimColor>Ctrl+W dismiss</Text>
      </Box>
    </Box>
  )
}

export function dismissBootWarnings(): void {
  sessionDismissed = true
}
