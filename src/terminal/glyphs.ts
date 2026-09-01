import { unicode } from './capabilities.ts'

type BorderTriple = readonly [string, string, string]

const borderTop: BorderTriple = unicode ? ['┌', '┬', '┐'] : ['+', '-', '+']
const borderMiddle: BorderTriple = unicode ? ['├', '┼', '┤'] : ['+', '-', '+']
const borderBottom: BorderTriple = unicode ? ['└', '┴', '┘'] : ['+', '-', '+']

export const glyphs = {
  spinnerFrames: unicode
    ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    : ['|', '/', '-', '\\'],
  bullets: unicode ? ['•', '◦', '▪'] : ['*', 'o', '-'],
  horizontal: unicode ? '─' : '-',
  tableVertical: unicode ? '│' : '|',
  tableBorders: {
    top: borderTop,
    middle: borderMiddle,
    bottom: borderBottom,
  },
  quoteBar: unicode ? '▌' : '|',
  taskChecked: unicode ? '☑' : '[x]',
  taskUnchecked: unicode ? '☐' : '[ ]',
  headerExpanded: unicode ? '↓' : 'v',
  headerCollapsed: '-',
  separator: unicode ? '·' : '-',
  tokenArrow: unicode ? '→' : '->',
  ellipsis: unicode ? '…' : '...',
  focusMarker: unicode ? '❯' : '>',
  tick: unicode ? '✓' : 'x',
  checkboxOn: unicode ? '[✓]' : '[x]',
  checkboxOff: '[ ]',
  pageFlip: unicode ? '⇄' : '<->',
  wrapArrows: unicode ? '⇅' : '^v',
  carouselLeft: unicode ? '◀' : '<',
  carouselRight: unicode ? '▶' : '>',
  todoPending: '[ ]',
  todoInProgress: unicode ? '[●]' : '[o]',
  todoDone: unicode ? '[√]' : '[x]',
  halfBlockCaps: unicode,
  blockCapTop: '▄',
  blockCapBottom: '▀',
}
