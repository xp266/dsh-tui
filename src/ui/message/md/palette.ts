import type { MarkStyle } from '../../../core/segments.ts'
import { COLORS } from '../../../theme.ts'

export interface MdPalette {
  plain: MarkStyle
  bold: MarkStyle
  italic: MarkStyle
  strike: MarkStyle
  link: MarkStyle
  inlineCode: MarkStyle
  quoteBar: MarkStyle
  hr: MarkStyle
  listMarker: MarkStyle
  taskDone: MarkStyle
  taskTodo: MarkStyle
  heading(level: number): MarkStyle
  codePlain: MarkStyle
  codeFallback: MarkStyle
}

export function createMdPalette(thinking: boolean): MdPalette {
  if (thinking) {
    return {
      plain: {},
      get bold() {
        return { bold: true }
      },
      get italic() {
        return { italic: true }
      },
      get strike() {
        return { strike: true }
      },
      get link() {
        return { color: COLORS.thinkLink, underline: true }
      },
      get inlineCode() {
        return { color: COLORS.thinkInlineCode }
      },
      get quoteBar() {
        return { color: COLORS.thinkQuoteBar }
      },
      get hr() {
        return { color: COLORS.thinkHr }
      },
      get listMarker() {
        return { color: COLORS.thinkList }
      },
      get taskDone() {
        return { color: COLORS.thinkTaskDone }
      },
      get taskTodo() {
        return { color: COLORS.thinkTaskTodo }
      },
      heading() {
        return { color: COLORS.thinkH1, bold: true }
      },
      get codePlain() {
        return { color: COLORS.thinkCodePlain }
      },
      get codeFallback() {
        return { color: COLORS.thinkCodeFallback }
      },
    }
  }
  return {
    plain: {},
    get bold() {
      return { bold: true }
    },
    get italic() {
      return { italic: true }
    },
    get strike() {
      return { strike: true }
    },
    get link() {
      return { color: COLORS.mdLink, underline: true }
    },
    get inlineCode() {
      return { color: COLORS.mdInlineCode }
    },
    get quoteBar() {
      return { color: COLORS.mdQuoteBar }
    },
    get hr() {
      return { color: COLORS.mdHr }
    },
    get listMarker() {
      return { color: COLORS.mdList }
    },
    get taskDone() {
      return { color: COLORS.mdTaskDone }
    },
    get taskTodo() {
      return { color: COLORS.mdTaskTodo }
    },
    heading(level) {
      if (level <= 2) return { color: COLORS.mdH1, bold: true }
      return { color: COLORS.mdH3, bold: true }
    },
    get codePlain() {
      return { color: COLORS.mdCodePlain }
    },
    get codeFallback() {
      return { color: COLORS.mdCodeFallback }
    },
  }
}
