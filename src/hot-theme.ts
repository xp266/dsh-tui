import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { replacePalettes } from './theme.ts'
import type { Theme, ThemeMode } from './theme.ts'
import { env } from './env.ts'
import { bumpSurface } from './kernel/surface.ts'

const REFRESH_MS = 300

export interface HotThemeHandle {
  stop(): void
}

const themeUrl = env.themePath === undefined
  ? new URL('../src/theme.ts', import.meta.url)
  : pathToFileURL(resolve(process.cwd(), env.themePath))

export function startHotTheme(onChange: () => void): HotThemeHandle | undefined {
  if (!env.hotTheme) return undefined
  let lastSource = ''
  try {
    lastSource = readFileSync(themeUrl, 'utf8')
  } catch {
    console.error('dsh-tui: DSH_TUI_HOT_THEME is set but the theme file is missing; hot theme disabled')
    return undefined
  }
  console.error('dsh-tui: hot theme enabled; saving the theme file applies colors live')
  const timer = setInterval(async () => {
    let source: string
    try {
      source = readFileSync(themeUrl, 'utf8')
    } catch {
      // The theme file vanished mid-session; keep the last applied palette.
      return
    }
    if (source === lastSource) return
    lastSource = source
    try {
      const fresh = (await import(`${themeUrl.href}?t=${Date.now()}`)) as {
        palettes: Record<ThemeMode, Theme>
      }
      replacePalettes(fresh.palettes)
      bumpSurface()
      onChange()
    } catch {
      // The theme file is mid-edit or temporarily broken; retry on the next tick.
    }
  }, REFRESH_MS)
  timer.unref()
  return {
    stop() {
      clearInterval(timer)
    },
  }
}
