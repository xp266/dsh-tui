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

interface ColorSpec {
  link: string
  inlineCode: string
  quoteBar: string
  hr: string
  list: string
  taskDone: string
  taskTodo: string
  h1: string
  h3: string
  codePlain: string
  codeFallback: string
}

const MD_SPEC: ColorSpec = {
  link: 'mdLink',
  inlineCode: 'mdInlineCode',
  quoteBar: 'mdQuoteBar',
  hr: 'mdHr',
  list: 'mdList',
  taskDone: 'mdTaskDone',
  taskTodo: 'mdTaskTodo',
  h1: 'mdH1',
  h3: 'mdH3',
  codePlain: 'mdCodePlain',
  codeFallback: 'mdCodeFallback',
}

const THINK_SPEC: ColorSpec = {
  link: 'thinkLink',
  inlineCode: 'thinkInlineCode',
  quoteBar: 'mdQuoteBar',
  hr: 'thinkHr',
  list: 'thinkList',
  taskDone: 'thinkTaskDone',
  taskTodo: 'thinkTaskTodo',
  h1: 'thinkH1',
  h3: 'thinkH1',
  codePlain: 'thinkCodePlain',
  codeFallback: 'thinkCodeFallback',
}

function buildPalette(spec: ColorSpec): MdPalette {
  const at = (key: string): MarkStyle => ({ color: (COLORS as unknown as Record<string, string>)[key] })
  return {
    plain: {},
    bold: { bold: true },
    italic: { italic: true },
    strike: { strike: true },
    link: { ...at(spec.link), underline: true },
    inlineCode: at(spec.inlineCode),
    quoteBar: at(spec.quoteBar),
    hr: at(spec.hr),
    listMarker: at(spec.list),
    taskDone: at(spec.taskDone),
    taskTodo: at(spec.taskTodo),
    heading(level) {
      return { color: (COLORS as unknown as Record<string, string>)[level <= 2 ? spec.h1 : spec.h3], bold: true }
    },
    codePlain: at(spec.codePlain),
    codeFallback: at(spec.codeFallback),
  }
}

export function createMdPalette(thinking: boolean): MdPalette {
  return buildPalette(thinking ? THINK_SPEC : MD_SPEC)
}
