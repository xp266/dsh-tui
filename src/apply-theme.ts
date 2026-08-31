import { setThemeMode } from './theme.ts'
import type { ThemeMode } from './theme.ts'
import { bumpSurface } from './kernel/surface.ts'

export function applyTheme(mode: ThemeMode): void {
  setThemeMode(mode)
  bumpSurface()
}
