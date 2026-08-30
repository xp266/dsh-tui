import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import type { DialogFooterLine } from './geometry.ts'

export function loadingLine(): DialogFooterLine {
  return { text: `loading${glyphs.ellipsis}`, color: COLORS.dialogHintText }
}

export function errorLine(text: string): DialogFooterLine {
  return { text, color: COLORS.errorText }
}
