import type { PERMISSION_PRESETS } from './chat/bridge.ts'
import { keyedRegistry } from './kernel/registry.ts'
import type { ThemePaletteContribution } from './contract/index.ts'

type PermissionModeId = typeof PERMISSION_PRESETS[number]

export type ThemeMode = 'dark' | 'light'

const paletteContributions = keyedRegistry<ThemePaletteContribution>()

export function registerPalette(contribution: ThemePaletteContribution): () => void {
  const dispose = paletteContributions.register(contribution.id, contribution, { order: contribution.order })
  materialize(currentMode)
  return () => {
    dispose()
    materialize(currentMode)
  }
}

export function subscribePalettes(listener: () => void): () => void {
  return paletteContributions.subscribe(listener)
}

/**
 * The palette is built from a fixed gray ladder plus one value per semantic
 * hue, so near-duplicate grays cannot drift apart again: every surface picks
 * its shade from the ladder, and every meaning (accent, info, success, error,
 * added, removed) owns exactly one color.
 */
interface GrayLadder {
  /** Page background (dialog backdrop). */
  base: string
  /** Sunken surface: tool cards, read bodies, terminal fills. */
  sunken: string
  /** Panel surface: dialogs, permission strip, user bubble. */
  surface: string
  /** Raised surface: inputs, hovered/selected rows. */
  raised: string
  /** Decorative gray: hr, quote bar, task markers, scroll thumb. */
  line: string
  /** Secondary text: hints, separators, tool body, thinking body. */
  text: string
  /** Primary text. */
  ink: string
}

const DARK_LADDER: GrayLadder = {
  base: '#0d0d0d',
  sunken: '#1a1a1a',
  surface: '#262626',
  raised: '#333333',
  line: '#686868',
  text: '#9a9a9a',
  ink: '#f0f0f0',
}

const LIGHT_LADDER: GrayLadder = {
  base: '#ffffff',
  sunken: '#f2f2f2',
  surface: '#e6e6e6',
  raised: '#d9d9d9',
  line: '#a6a6a6',
  text: '#595959',
  ink: '#1a1a1a',
}

interface SemanticHues {
  /** The one accent: section headers, list markers, effort, selection focus. */
  accent: string
  /** Informational blue: permission mode, links, focus labels. */
  info: string
  success: string
  error: string
  /** Diff/code-fence addition green (distinct from success so status and diff never share). */
  added: string
  /** Diff/code-fence removal red (distinct from error so status and diff never share). */
  removed: string
}

const DARK_HUES: SemanticHues = {
  accent: '#ffae00',
  info: '#4da0e8',
  success: '#4caf50',
  error: '#ff6753',
  added: '#33b84d',
  removed: '#d25044',
}

const LIGHT_HUES: SemanticHues = {
  accent: '#a86800',
  info: '#2f6fd0',
  success: '#2e8b3d',
  error: '#d44a3a',
  added: '#0a8a2c',
  removed: '#c22318',
}

/**
 * Code-fence hues: one value per syntax role, tuned per theme. Thinking uses
 * the same hues desaturated toward the gray ladder instead of a hand-written
 * second copy, so the two can never drift.
 */
interface CodeHues {
  comment: string
  string: string
  number: string
  keyword: string
  fn: string
  type: string
  variable: string
  fallback: string
}

const DARK_CODE: CodeHues = {
  comment: '#5d9e50',
  string: '#d78f6e',
  number: '#82c46e',
  keyword: '#c883c8',
  fn: '#d8d89e',
  type: '#52a898',
  variable: '#4d9fd6',
  fallback: '#a3b56a',
}

const LIGHT_CODE: CodeHues = {
  comment: '#4a8a3d',
  string: '#a05f42',
  number: '#3f9a63',
  keyword: '#8f4a88',
  fn: '#7a7a3d',
  type: '#2a7a6e',
  variable: '#3a76a8',
  fallback: '#647a34',
}

/** Mix two hex colors channel-wise; t=0 keeps the hue, t=1 keeps the gray. */
function tint(hue: string, gray: string, t: number): string {
  const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16)
  const mix = (at: number): string => {
    const value = Math.round(channel(hue, at) * (1 - t) + channel(gray, at) * t)
    return value.toString(16).padStart(2, '0')
  }
  return `#${mix(1)}${mix(3)}${mix(5)}`
}

const THINK_DESATURATE = 0.55

function buildPalette(ladder: GrayLadder, hues: SemanticHues, code: CodeHues, mode: 'dark' | 'light'): Theme {
  const think = (hue: string): string => tint(hue, ladder.text, mode === 'dark' ? THINK_DESATURATE : 0.35)
  const thinkCode = Object.fromEntries(
    Object.entries(code).map(([key, hue]) => [key, think(hue)]),
  ) as Record<keyof CodeHues, string>
  return {
    userBubbleBackground: ladder.surface,
    aiBubbleBackground: ladder.sunken,

    permissionBackground: ladder.sunken,
    workspaceWriteText: hues.info,
    dangerFullAccessText: hues.accent,
    readOnlyText: hues.success,

    dialogBackground: ladder.base,
    dialogInputBackground: ladder.raised,
    dialogHintText: ladder.text,
    carouselCurrentBg: ladder.raised,
    carouselButtonBg: ladder.sunken,
    carouselButtonPressedBg: ladder.surface,
    carouselSelectedText: hues.accent,

    sectionHeader: hues.accent,

    panelQuestionText: ladder.ink,
    panelKeyText: ladder.ink,
    modelText: ladder.ink,
    effortText: hues.accent,
    statusSeparator: ladder.text,
    presetText: ladder.text,

    cwdText: ladder.text,
    statsText: ladder.text,

    errorText: hues.error,
    success: hues.success,
    warning: hues.accent,

    specialFieldText: mode === 'dark' ? '#1a1a1a' : '#3d2800',
    specialFieldBackground: hues.accent,

    toolLabel: mode === 'dark' ? '#2fc0e0' : '#0092b8',
    toolBodyText: ladder.text,

    diffAdded: hues.added,
    diffRemoved: hues.removed,
    diffAddedBackground: mode === 'dark' ? '#384751' : '#ddf0ea',
    diffRemovedBackground: mode === 'dark' ? '#4f312c' : '#f5e8e5',

    scrollTrackBackground: ladder.sunken,
    scrollThumbBackground: ladder.line,

    // The text selection highlight is a fixed saturated blue in both modes:
    // it must stay high-contrast behind white fg, and it is not the info hue.
    selectionBg: '#0066ff',
    selectionFg: '#ffffff',

    mdBold: ladder.ink,
    mdLink: hues.info,
    mdInlineCode: hues.added,
    mdQuoteBar: ladder.line,
    mdHr: ladder.line,
    mdList: hues.accent,
    mdTaskDone: hues.added,
    mdTaskTodo: ladder.line,
    mdH1: mode === 'dark' ? '#e0b568' : '#8a6d2f',
    mdH3: mode === 'dark' ? '#64b5d6' : '#2f6fa8',
    mdCodePlain: ladder.ink,
    mdCodeFallback: code.fallback,

    codeComment: code.comment,
    codeString: code.string,
    codeNumber: code.number,
    codeKeyword: code.keyword,
    codeFunction: code.fn,
    codeType: code.type,
    codeVariable: code.variable,
    codeConstant: code.variable,
    codeOperator: ladder.ink,

    thinkBold: ladder.text,
    thinkLink: think(hues.info),
    thinkInlineCode: think(hues.added),
    thinkQuoteBar: ladder.line,
    thinkHr: tint(ladder.line, ladder.base, 0.35),
    thinkList: ladder.text,
    thinkTaskDone: think(hues.added),
    thinkTaskTodo: ladder.line,
    thinkH1: ladder.text,
    thinkH3: ladder.text,
    thinkCodePlain: ladder.text,
    thinkCodeFallback: thinkCode.fallback,
    thinkCodeComment: thinkCode.comment,
    thinkCodeString: thinkCode.string,
    thinkCodeNumber: thinkCode.number,
    thinkCodeKeyword: thinkCode.keyword,
    thinkCodeFunction: thinkCode.fn,
    thinkCodeType: thinkCode.type,
    thinkCodeVariable: thinkCode.variable,
    thinkCodeConstant: thinkCode.variable,
  }
}

const darkPalette = buildPalette(DARK_LADDER, DARK_HUES, DARK_CODE, 'dark') as Record<string, string>
const lightPalette = buildPalette(LIGHT_LADDER, LIGHT_HUES, LIGHT_CODE, 'light') as Record<string, string>

export interface Theme extends Readonly<Record<keyof typeof darkPalette, string>> {}

export const palettes: Record<ThemeMode, Theme> = { dark: darkPalette as Theme, light: lightPalette as Theme }

export const COLORS: Theme = { ...darkPalette } as Theme

let currentMode: ThemeMode = 'dark'

export function themeMode(): ThemeMode {
  return currentMode
}

function permissionModes(): Record<PermissionModeId, { color: string; textColor: string; name: string }> {
  return {
    'workspace-write': { color: COLORS.permissionBackground, textColor: COLORS.workspaceWriteText, name: 'Workspace Write' },
    'danger-full-access': { color: COLORS.permissionBackground, textColor: COLORS.dangerFullAccessText, name: 'Full access' },
    'read-only': { color: COLORS.permissionBackground, textColor: COLORS.readOnlyText, name: 'Read Only' },
  }
}

function effectivePalette(mode: ThemeMode): Theme {
  const merged: Record<string, string> = { ...palettes[mode] }
  for (const contribution of paletteContributions.values()) {
    if (contribution.mode !== undefined && contribution.mode !== 'both' && contribution.mode !== mode) continue
    Object.assign(merged, contribution.colors)
  }
  return merged as Theme
}

function materialize(mode: ThemeMode): void {
  Object.assign(COLORS, effectivePalette(mode))
  Object.assign(PERMISSION_MODES, permissionModes())
}

/**
 * Read a palette color by key, including keys contributed by plugins that
 * are not part of the built-in Theme type. Falls back to the raw key when
 * nothing defines it, so custom semantic names remain visible.
 */
export function paletteColor(key: string): string {
  const value = (COLORS as unknown as Record<string, string>)[key]
  return value ?? key
}

export function setThemeMode(mode: ThemeMode): void {
  currentMode = mode
  materialize(mode)
}

export function replacePalettes(next: Record<ThemeMode, Theme>): void {
  Object.assign(palettes.dark, next.dark)
  Object.assign(palettes.light, next.light)
  materialize(currentMode)
}

export const PERMISSION_MODES: Record<PermissionModeId, { color: string; textColor: string; name: string }> = permissionModes()

materialize(currentMode)

export function permissionModeInfo(mode: string): { color: string; textColor: string; name: string } {
  return PERMISSION_MODES[mode as keyof typeof PERMISSION_MODES]
    ?? { color: COLORS.permissionBackground, textColor: COLORS.workspaceWriteText, name: mode }
}
