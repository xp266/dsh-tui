/**
 * Key-event suppression for ink's broadcast-based useInput.
 *
 * ink delivers every stdin chunk to every useInput subscriber, and delivery
 * order follows subscription order: KeymapGate (chrome key contributions,
 * mounted as the first child) -> message list -> composer -> panels ->
 * dialog -> the App shell. A participant that must win over the later ones
 * marks the current event consumed; later participants skip it.
 *
 * The consumed flag is scoped to one stdin chunk. KeymapGate bumps the
 * generation from its own stdin data listener, so even several synchronous
 * writes (as tests do) each get a fresh generation and no flag leaks across
 * events.
 */
let generation = 0
let consumedAtGeneration = -1

/** Start a new key-event generation; called once per stdin chunk. */
export function beginKeyEvent(): void {
  generation += 1
}

/** Chrome key contributions consumed the event; later participants must skip it. */
export function markKeymapConsumed(): void {
  consumedAtGeneration = generation
}

/** True when the chrome key chain consumed the current key event. */
export function isKeyConsumed(): boolean {
  return consumedAtGeneration === generation
}

/** Test helper. */
export function resetKeyEvents(): void {
  generation = 0
  consumedAtGeneration = -1
}
