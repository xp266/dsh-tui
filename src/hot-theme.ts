import { readFileSync } from 'node:fs'
import { COLORS, PERMISSION_MODES } from './theme.ts'
import { clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearLayoutCache } from './ui/message/layout.ts'

const REFRESH_MS = 300

export interface HotThemeHandle {
  stop(): void
}

export function startHotTheme(onChange: () => void): HotThemeHandle | undefined {
  if (process.env.DSH_TUI_HOT_THEME !== '1') return undefined
  const themePath = new URL('../src/theme.ts', import.meta.url)
  let lastSource = ''
  try {
    lastSource = readFileSync(themePath, 'utf8')
  } catch {
    console.error('dsh-tui: DSH_TUI_HOT_THEME is set but src/theme.ts is missing; hot theme disabled')
    return undefined
  }
  console.error('dsh-tui: hot theme enabled; saving src/theme.ts applies colors live')
  const timer = setInterval(async () => {
    let source: string
    try {
      source = readFileSync(themePath, 'utf8')
    } catch {
      return
    }
    if (source === lastSource) return
    lastSource = source
    try {
      const fresh = (await import(`../src/theme.ts?t=${Date.now()}`)) as {
        COLORS: typeof COLORS
        PERMISSION_MODES: typeof PERMISSION_MODES
      }
      Object.assign(COLORS, fresh.COLORS)
      Object.assign(PERMISSION_MODES, fresh.PERMISSION_MODES)
      clearLayoutCache()
      clearHighlightCache()
      clearMarkdownBlockCache()
      onChange()
    } catch {
      // theme.ts is mid-edit or temporarily broken; retry on the next tick
    }
  }, REFRESH_MS)
  timer.unref()
  return {
    stop() {
      clearInterval(timer)
    },
  }
}