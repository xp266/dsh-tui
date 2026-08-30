import { describe, expect, it, vi } from 'vitest'
import { COLORS, setThemeMode, themeMode } from '../src/theme.ts'
import { glyphs } from '../src/terminal/glyphs.ts'
import { registerThemeSettings, THEME_SETTINGS_NAMESPACE } from '../src/theme-settings.ts'

const ENV_KEYS = ['DSH_TUI_COLOR', 'DSH_TUI_ASCII', 'NO_COLOR', 'FORCE_COLOR', 'TERM', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION', 'CI', 'LC_ALL', 'LANG'] as const

async function detectWith(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): Promise<{ colorLevel: number; unicode: boolean }> {
  const saved: Record<string, string | undefined> = {}
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]!
  }
  try {
    vi.resetModules()
    const mod = await import('../src/terminal/capabilities.ts')
    return { colorLevel: mod.colorLevel, unicode: mod.unicode }
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]!
    }
  }
}

describe('terminal capability detection', () => {
  it('detects the highest color level the terminal supports', async () => {
    expect((await detectWith({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })).colorLevel).toBe(3)
    expect((await detectWith({ TERM: 'xterm-256color' })).colorLevel).toBe(2)
    expect((await detectWith({ TERM: 'xterm' })).colorLevel).toBe(1)
  })

  it('disables color for NO_COLOR and dumb terminals', async () => {
    expect((await detectWith({ TERM: 'xterm-256color', NO_COLOR: '1' })).colorLevel).toBe(0)
    expect((await detectWith({ TERM: 'dumb' })).colorLevel).toBe(0)
  })

  it('honors the DSH_TUI_COLOR override over everything', async () => {
    expect((await detectWith({ TERM: 'xterm', NO_COLOR: '1', DSH_TUI_COLOR: '3' })).colorLevel).toBe(3)
    expect((await detectWith({ COLORTERM: 'truecolor', DSH_TUI_COLOR: '1' })).colorLevel).toBe(1)
  })

  it('detects unicode support from locale and TERM', async () => {
    expect((await detectWith({ TERM: 'xterm-256color', LANG: 'C.UTF-8' })).unicode).toBe(true)
    expect((await detectWith({ TERM: 'xterm-256color', LANG: 'C' })).unicode).toBe(false)
    expect((await detectWith({ TERM: 'dumb', LANG: 'en_US.UTF-8' })).unicode).toBe(false)
    expect((await detectWith({ TERM: 'xterm-256color', LANG: 'en_US.UTF-8', DSH_TUI_ASCII: '1' })).unicode).toBe(false)
  })
})

describe('theme settings namespace', () => {
  function fakeCtx() {
    let registeredNs = ''
    let schema: ((value: unknown) => { mode?: string }) | undefined
    const ctx = {
      get: () => ({
        register(ns: string, next: (value: unknown) => { mode?: string }) {
          registeredNs = ns
          schema = next
          return { get: () => schema!({}) }
        },
      }),
    }
    return { ctx, ns: () => registeredNs, schema: () => schema! }
  }

  it('registers under the dsh-tui- prefixed namespace', () => {
    const { ctx, ns } = fakeCtx()
    const scope = registerThemeSettings(ctx as never)
    expect(ns()).toBe(THEME_SETTINGS_NAMESPACE)
    expect(ns()).toBe('dsh-tui-theme')
    expect(scope?.get().mode).toBeUndefined()
  })

  it('accepts a stored mode and rejects unknown values', () => {
    const { ctx, schema } = fakeCtx()
    registerThemeSettings(ctx as never)
    expect(schema()({ mode: 'light' }).mode).toBe('light')
    expect(() => schema()({ mode: 'bogus' })).toThrow()
  })

  it('survives a missing settings service', () => {
    expect(registerThemeSettings({ get: () => undefined } as never)).toBeUndefined()
  })
})

describe('theme modes', () => {
  it('exposes palettes for the hot-theme reload path', async () => {
    vi.resetModules()
    const fresh = await import('../src/theme.ts')
    expect(fresh.palettes.dark.modelText).toBeDefined()
    expect(fresh.palettes.light.modelText).toBeDefined()
    const darkModel = fresh.COLORS.modelText
    fresh.replacePalettes(fresh.palettes)
    expect(fresh.COLORS.modelText).toBe(darkModel)
    expect(fresh.themeMode()).toBe('dark')
  })

  it('materializes both modes over the same token set', () => {
    setThemeMode('dark')
    const dark = { ...COLORS }
    setThemeMode('light')
    expect(Object.keys(COLORS).sort()).toEqual(Object.keys(dark).sort())
    expect(themeMode()).toBe('light')
    expect(COLORS.modelText).toBe('#111111')
    expect(COLORS.dialogBackground).toBe('#ffffff')
    setThemeMode('dark')
    expect(themeMode()).toBe('dark')
    expect(COLORS.modelText).toBe('#ffffff')
    expect(COLORS.dialogBackground).toBe('#000000')
  })

  it('keeps every glyph table populated', () => {
    for (const [key, value] of Object.entries(glyphs)) {
      if (Array.isArray(value)) {
        expect(value.length, key).toBeGreaterThan(0)
        for (const entry of value) expect(entry.length, key).toBeGreaterThan(0)
      } else if (typeof value === 'string') {
        expect(value.length, key).toBeGreaterThan(0)
      }
    }
    expect(glyphs.spinnerFrames.length).toBeGreaterThan(1)
    expect(glyphs.bullets.length).toBe(3)
  })
})
