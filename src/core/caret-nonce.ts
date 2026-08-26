/**
Invisible repaint trigger for pure-caret moves: a space carries a truecolor
value derived from the caret offset, so every move changes frame bytes and
keeps the renderer on the rewrite path whose placement we can compensate.
*/
export function caretNonceColor(cursor: number): string {
  return `#${(cursor % 4096).toString(16).padStart(3, '0')}`
}
