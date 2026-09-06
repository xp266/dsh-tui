import { writeSync } from 'node:fs'

/**
 * Single choke point for terminal mode changes: every enter/exit of a
 * terminal mode registers its restore sequence here, so one
 * restoreAllModes() call on any exit path inverts everything that was
 * applied — including the modes ink enables on our behalf (seeded with an
 * empty enter sequence). Windows TTY writes through process.stdout are
 * asynchronous, so mode sequences must be written synchronously through
 * fd 1 or they are silently dropped at exit.
 */
const applied = new Map<string, string>()

export function writeStdoutRaw(text: string): void {
  try {
    writeSync(1, text)
  } catch {
    // A full stdout buffer (EAGAIN) can only be retried asynchronously.
    process.stdout.write(text)
  }
}

export function enterMode(name: string, sequence: string, restore: string): void {
  applied.set(name, restore)
  if (sequence !== '') writeStdoutRaw(sequence)
}

export function exitMode(name: string): void {
  const restore = applied.get(name)
  if (restore === undefined) return
  applied.delete(name)
  writeStdoutRaw(restore)
}

/** Restore every still-applied mode, newest first. */
export function restoreAllModes(): void {
  for (const restore of [...applied.values()].reverse()) writeStdoutRaw(restore)
  applied.clear()
}
