/**
 * Ink 7.1.1 places the caret one row high on the rewrite path; every caret
 * move changes these frame bytes so the diff renderer stays on the rewrite
 * path that useCaret() compensates for. The variant span exceeds any
 * terminal width, so no frame follows the misplaced cursor-only path.
 */
const NONCE_SPAN = 240

export function caretNonceColor(cursor: number): string {
  return `ansi256(${16 + (cursor % NONCE_SPAN)})`
}

export function caretNonceText(cursor: number): string {
  return Math.floor(cursor / NONCE_SPAN) % 2 === 0 ? ' ' : '\u00a0'
}

export function caretNonceBold(cursor: number): boolean {
  return Math.floor(cursor / (NONCE_SPAN * 2)) % 2 === 0
}
