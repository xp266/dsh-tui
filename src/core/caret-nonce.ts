/**
Invisible rewrite-path forcing for pure-caret moves. Stock ink's rewrite and
cursor-only placement paths disagree by one row in fullscreen mode, and no
constant offset satisfies both, so every caret move must change frame bytes to
keep the renderer on the rewrite path whose placement use-caret compensates.
The nonce blends an exact ANSI-256 index color (emitted verbatim at every
color level, unlike hex which collapses under downsampling) with a bold toggle
and a blank-character variant, giving 960 byte-visible states: more than any
terminal width, so no single-frame caret displacement can fall through to the
misplaced cursor-only path.
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
