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
  /** Content-card surface: tool cards, compaction, system bubbles. */
  card: string
  /** Interactive surface: the input panel and user bubbles. */
  control: string
  /** Sunken chrome: scrollbar track, carousel buttons. */
  sunken: string
  /** Panel surface: dialogs, permission strip, carousel selection. */
  surface: string
  /** Raised surface: dialog inputs, hovered/selected rows. */
  raised: string
  /** Decorative gray: hr, quote bar, task markers, scroll thumb. */
  line: string
  /** Secondary text: hints, separators, tool body, thinking body. */
  text: string
  /** Primary text. */
  ink: string
}

// In dark, card and sunken share the 10% step; the light theme keeps them
// apart (card on surface, sunken lighter), so they stay separate rungs.
const DARK_LADDER: GrayLadder = {
  base: '#0d0d0d',
  card: '#1a1a1a',
  control: '#1e1e1e',
  sunken: '#1a1a1a',
  surface: '#262626',
  raised: '#333333',
  line: '#686868',
  text: '#9a9a9a',
  ink: '#cccccc',
}

// Light keeps card and control on the surface gray: the dark theme splits
// them, but the light surfaces never needed the extra steps.
const LIGHT_LADDER: GrayLadder = {
  base: '#ffffff',
  card: '#e6e6e6',
  control: '#e6e6e6',
  sunken: '#f2f2f2',
  surface: '#e6e6e6',
  raised: '#d9d9d9',
  line: '#999999',
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
  added: '#5d9e50',
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

function buildPalette(ladder: GrayLadder, hues: SemanticHues, code: CodeHues, mode: 'dark' | 'light') {
  const think = (hue: string): string => tint(hue, ladder.text, mode === 'dark' ? THINK_DESATURATE : 0.35)
  const thinkCode = Object.fromEntries(
    Object.entries(code).map(([key, hue]) => [key, think(hue)]),
  ) as Record<keyof CodeHues, string>
  return {
    ink: ladder.ink,

    userBubbleBackground: ladder.control,
    aiBubbleBackground: ladder.card,

    permissionBackground: ladder.control,
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

    /** Hovered collapsible tool card; interaction state, not content. */
    hoverBackground: mode === 'dark' ? '#262626' : ladder.raised,

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

    // The busy-Enter delivery chips are always blue, in both modes: they are
    // the only chip that schedules rather than summarizes, and the blue keeps
    // them distinct from the amber paste/image chips.
    deliveryChipText: mode === 'dark' ? '#f2f7ff' : '#ffffff',
    deliveryChipBackground: mode === 'dark' ? '#2563eb' : '#1d4ed8',

    toolLabel: mode === 'dark' ? '#2fc0e0' : '#0092b8',
    toolBodyText: ladder.text,

    diffAdded: hues.added,
    diffRemoved: hues.removed,
    diffAddedBackground: mode === 'dark' ? '#384751' : '#e1f1e5',
    diffRemovedBackground: mode === 'dark' ? '#4f312c' : '#f5e8e5',

    scrollTrackBackground: ladder.sunken,
    scrollThumbBackground: ladder.line,

    // The selection highlight is a fixed saturated blue in both modes; the
    // foreground rides the terminal-default gray so selected text never
    // outshines the selection itself.
    selectionBg: '#0066ff',
    selectionFg: '#cccccc',

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

    thinkLink: think(hues.info),
    thinkInlineCode: think(hues.added),
    thinkHr: tint(ladder.line, ladder.base, mode === 'dark' ? 0.35 : 0.15),
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

    homeLogoTop: mode === 'dark' ? '#e1e1e1' : '#7f7f7f',
    homeLogoBottom: mode === 'dark' ? '#6c6c6c' : '#292929',
  }
}

const darkPalette = buildPalette(DARK_LADDER, DARK_HUES, DARK_CODE, 'dark')
const lightPalette = buildPalette(LIGHT_LADDER, LIGHT_HUES, LIGHT_CODE, 'light')

export interface Theme extends Readonly<Record<keyof typeof darkPalette, string>> {}

export const palettes: Record<ThemeMode, Theme> = { dark: darkPalette, light: lightPalette }

export const COLORS: Theme = { ...darkPalette }

/**
 * The un-dimmed palette the dialog layer renders with: while a window is
 * open, COLORS drops in brightness behind it, DIALOG_COLORS does not.
 */
export const DIALOG_COLORS: Theme = { ...darkPalette }

// Interaction state, not content: the selection highlight stays at full
// brightness in the dimmed region and inside the dialog alike.
const DIALOG_DIM_EXEMPT: ReadonlySet<keyof Theme> = new Set(['selectionBg', 'selectionFg'])

const DIALOG_DIM_RATIO = 0.5

/** Every channel scales by the same ratio, which lowers HSL lightness while
 *  keeping hue and saturation untouched, so one rule dims every color. */
function dimHex(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (match === null) return hex
  const channel = (at: number): string => Math.round(parseInt(match[at]!, 16) * DIALOG_DIM_RATIO).toString(16).padStart(2, '0')
  return `#${channel(1)}${channel(2)}${channel(3)}`
}

function dimPalette(palette: Theme): Theme {
  const dimmed: Record<string, string> = { ...palette }
  for (const key of Object.keys(dimmed)) {
    if (DIALOG_DIM_EXEMPT.has(key as keyof Theme)) continue
    dimmed[key] = dimHex(dimmed[key]!)
  }
  return dimmed as Theme
}

let dialogDimActive = false
const dialogDimListeners = new Set<() => void>()

export function subscribeDimState(listener: () => void): () => void {
  dialogDimListeners.add(listener)
  return () => {
    dialogDimListeners.delete(listener)
  }
}

export function setDialogDimmed(dimmed: boolean): void {
  if (dialogDimActive === dimmed) return
  dialogDimActive = dimmed
  materialize(currentMode)
  for (const listener of [...dialogDimListeners]) {
    try {
      listener()
    } catch {
      // One broken listener must not leave the dim state half-published.
    }
  }
}

let currentMode: ThemeMode = 'dark'

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
  const palette = effectivePalette(mode)
  Object.assign(DIALOG_COLORS, palette)
  Object.assign(COLORS, dialogDimActive ? dimPalette(palette) : palette)
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
