import { setThemeMode } from './theme.ts'
import type { ThemeMode } from './theme.ts'
import { clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearLayoutCache } from './ui/message/layout.ts'

export function applyTheme(mode: ThemeMode): void {
  setThemeMode(mode)
  clearLayoutCache()
  clearHighlightCache()
  clearMarkdownBlockCache()
}
