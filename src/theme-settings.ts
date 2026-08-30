import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ThemeMode } from './theme.ts'

export const THEME_SETTINGS_NAMESPACE = 'dsh-tui-theme'

export interface ThemeSettings {
  mode?: ThemeMode
}

const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  mode: z.union(['dark', 'light']),
})

export interface ThemeSettingsScope {
  get(): ThemeSettings
}

interface SettingsServiceLike {
  register(ns: string, schema: z<ThemeSettings>, options?: object): ThemeSettingsScope
}

export function registerThemeSettings(ctx: Context): ThemeSettingsScope | undefined {
  const settings = ctx.get('settings') as SettingsServiceLike | undefined
  try {
    return settings?.register(THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema)
  } catch {
    return undefined
  }
}
