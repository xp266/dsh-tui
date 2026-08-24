import type { MarkStyle } from '../../../core/segments.ts'
import { colors } from '../../../theme.ts'

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
        return { color: colors.thinkBold, bold: true }
      },
      get italic() {
        return { italic: true }
      },
      get strike() {
        return { strike: true }
      },
      get link() {
        return { color: colors.thinkLink, underline: true }
      },
      get inlineCode() {
        return { color: colors.thinkInlineCode }
      },
      get quoteBar() {
        return { color: colors.thinkQuoteBar }
      },
      get hr() {
        return { color: colors.thinkHr }
      },
      get listMarker() {
        return { color: colors.thinkList }
      },
      get taskDone() {
        return { color: colors.thinkTaskDone }
      },
      get taskTodo() {
        return { color: colors.thinkTaskTodo }
      },
      heading(level) {
        if (level <= 1) return { color: colors.thinkH1, bold: true }
        if (level === 2) return { color: colors.thinkH2, bold: true }
        if (level === 3) return { color: colors.thinkH3, bold: true }
        return { color: colors.thinkH4, bold: true }
      },
      get codePlain() {
        return { color: colors.thinkCodePlain }
      },
      get codeFallback() {
        return { color: colors.thinkCodeFallback }
      },
    }
  }
  return {
    plain: {},
    get bold() {
      return { color: colors.mdBold, bold: true }
    },
    get italic() {
      return { italic: true }
    },
    get strike() {
      return { strike: true }
    },
    get link() {
      return { color: colors.mdLink, underline: true }
    },
    get inlineCode() {
      return { color: colors.mdInlineCode }
    },
    get quoteBar() {
      return { color: colors.mdQuoteBar }
    },
    get hr() {
      return { color: colors.mdHr }
    },
    get listMarker() {
      return { color: colors.mdList }
    },
    get taskDone() {
      return { color: colors.mdTaskDone }
    },
    get taskTodo() {
      return { color: colors.mdTaskTodo }
    },
    heading(level) {
      if (level <= 1) return { color: colors.mdH1, bold: true }
      if (level === 2) return { color: colors.mdH2, bold: true }
      if (level === 3) return { color: colors.mdH3, bold: true }
      return { color: colors.mdH4, bold: true }
    },
    get codePlain() {
      return { color: colors.mdCodePlain }
    },
    get codeFallback() {
      return { color: colors.mdCodeFallback }
    },
  }
}
