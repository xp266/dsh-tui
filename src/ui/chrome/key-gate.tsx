import { useInput, useStdin } from 'ink'
import { useEffect } from 'react'
import { beginKeyEvent, markKeymapConsumed } from '../key-arbiter.ts'
import { handleKeyContributions } from '../keymap.ts'

/**
 * Earliest key subscriber. Chrome key contributions are evaluated here with
 * true preemption over every later participant (message list, composer,
 * panels, dialog, shell), which all observe the arbiter's consumed flag.
 * A new arbitration generation starts per stdin data chunk so a consumed
 * flag never leaks into the next physical key event, however events are
 * batched by the terminal or the test harness.
 */
export function KeymapGate(): null {
  const { stdin } = useStdin()
  useEffect(() => {
    const onData = (): void => {
      beginKeyEvent()
    }
    stdin?.on('data', onData)
    return () => {
      stdin?.off('data', onData)
    }
  }, [stdin])
  useInput((input, key) => {
    if (handleKeyContributions(input, key)) markKeymapConsumed()
  })
  return null
}
