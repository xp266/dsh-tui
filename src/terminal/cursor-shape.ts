const SEQUENCES = {
  beam: '\x1b[1 q',
  block: '\x1b[2 q',
  reset: '\x1b[0 q',
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
} as const

export type CursorShape = keyof typeof SEQUENCES

export function writeCursorShape(shape: CursorShape): void {
  process.stdout.write(SEQUENCES[shape])
}
