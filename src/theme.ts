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

const darkPalette = {
  userBubbleBackground: '#262626',
  aiBubbleBackground: '#141414',

  permissionBackground: '#202020',
  workspaceWriteText: '#006eff',
  dangerFullAccessText: '#ffae00',
  readOnlyText: '#4caf50',

  dialogBackground: '#000000',
  dialogInputBackground: '#2f2f2f',
  dialogHintText: '#808080',
  carouselCurrentBg: '#2e2e2e',
  carouselButtonBg: '#1a1a1a',
  carouselButtonPressedBg: '#3a3a3a',
  carouselSelectedText: '#ffae00',

  sectionHeader: '#ffae00',

  panelQuestionText: '#ffffff',
  panelKeyText: '#ffffff',
  modelText: '#ffffff',
  effortText: '#ffae00',
  statusSeparator: '#aaaaaa',
  presetText: '#aaaaaa',

  cwdText: '#aaaaaa',
  statsText: '#aaaaaa',

  errorText: '#ff6753',
  success: '#4caf50',
  warning: '#ffae00',

  specialFieldText: '#1a1a1a',
  specialFieldBackground: '#ffae00',

  toolLabel: '#2fc0e0',
  toolBodyText: '#8a8a8a',

  diffAdded: '#33b84d',
  diffRemoved: '#d25044',
  diffAddedBackground: '#384751',
  diffRemovedBackground: '#4f312c',

  scrollTrackBackground: '#2b2b2b',
  scrollThumbBackground: '#5b5b5b',

  selectionBg: '#0066ff',
  selectionFg: '#ffffff',

  mdBold: '#d4d4d4',
  mdLink: '#4da0e8',
  mdInlineCode: '#4caf50',
  mdQuoteBar: '#8a8a8a',
  mdHr: '#666666',
  mdList: '#ffae00',
  mdTaskDone: '#4caf50',
  mdTaskTodo: '#8a8a8a',
  mdH1: '#e0b568',
  mdH2: '#e0b568',
  mdH3: '#64b5d6',
  mdH4: '#64b5d6',
  mdCodePlain: '#d4d4d4',
  mdCodeFallback: '#a3b56a',

  thinkBold: '#9a9a9a',
  thinkLink: '#39698f',
  thinkInlineCode: '#2e7d32',
  thinkQuoteBar: '#585858',
  thinkHr: '#444444',
  thinkList: '#6e6e6e',
  thinkTaskDone: '#2e7d32',
  thinkTaskTodo: '#686868',
  thinkH1: '#8d8d8d',
  thinkH2: '#8d8d8d',
  thinkH3: '#8d8d8d',
  thinkH4: '#8d8d8d',
  thinkCodePlain: '#9a9a9a',
  thinkCodeFallback: '#708258',

  codeComment: '#5d9e50',
  codeString: '#d78f6e',
  codeNumber: '#82c46e',
  codeKeyword: '#c883c8',
  codeFunction: '#d8d89e',
  codeType: '#52a898',
  codeVariable: '#4d9fd6',
  codeConstant: '#4d9fd6',
  codeOperator: '#cccccc',

  thinkCodeComment: '#4e7a3f',
  thinkCodeString: '#93684f',
  thinkCodeNumber: '#7f9c73',
  thinkCodeKeyword: '#8d5c8a',
  thinkCodeFunction: '#9c9a6e',
  thinkCodeType: '#38897a',
  thinkCodeVariable: '#6e9cb3',
  thinkCodeConstant: '#3888b3',
} as const

export interface Theme extends Readonly<Record<keyof typeof darkPalette, string>> {}

const lightPalette: Theme = {
  userBubbleBackground: '#e4e4e4',
  aiBubbleBackground: '#f2f1f0',

  permissionBackground: '#ececec',
  workspaceWriteText: '#0052cc',
  dangerFullAccessText: '#a86800',
  readOnlyText: '#2e8b3d',

  dialogBackground: '#ffffff',
  dialogInputBackground: '#f0f0f0',
  dialogHintText: '#4a4a4a',
  carouselCurrentBg: '#efefef',
  carouselButtonBg: '#e3e3e3',
  carouselButtonPressedBg: '#d4d4d4',
  carouselSelectedText: '#a86800',

  sectionHeader: '#a86800',
  panelQuestionText: '#111111',
  panelKeyText: '#111111',

  modelText: '#000000',
  effortText: '#a86800',
  statusSeparator: '#8a8a8a',
  presetText: '#3d3d3d',

  cwdText: '#3d3d3d',
  statsText: '#3d3d3d',

  errorText: '#d44a3a',
  success: '#2e8b3d',
  warning: '#a86800',

  specialFieldText: '#3d2800',
  specialFieldBackground: '#ffae00',

  toolLabel: '#0092b8',
  toolBodyText: '#4a4a4a',

  diffAdded: '#0a8a2c',
  diffRemoved: '#c22318',
  diffAddedBackground: '#ddf0ea',
  diffRemovedBackground: '#f5e8e5',

  scrollTrackBackground: '#e4e4e4',
  scrollThumbBackground: '#9a9a9a',

  selectionBg: '#0066ff',
  selectionFg: '#ffffff',

  mdBold: '#333333',
  mdLink: '#2f6fd0',
  mdInlineCode: '#2e8b3d',
  mdQuoteBar: '#9a9a9a',
  mdHr: '#c8c8c8',
  mdList: '#a86800',
  mdTaskDone: '#2e8b3d',
  mdTaskTodo: '#9a9a9a',
  mdH1: '#8a6d2f',
  mdH2: '#8a6d2f',
  mdH3: '#2f6fa8',
  mdH4: '#2f6fa8',
  mdCodePlain: '#222222',
  mdCodeFallback: '#647a34',

  thinkBold: '#8a8a8a',
  thinkLink: '#6a92b5',
  thinkInlineCode: '#5f9c67',
  thinkQuoteBar: '#b8b8b8',
  thinkHr: '#dcdcdc',
  thinkList: '#767676',
  thinkTaskDone: '#5f9c67',
  thinkTaskTodo: '#a8a8a8',
  thinkH1: '#6a6a6a',
  thinkH2: '#6a6a6a',
  thinkH3: '#6a6a6a',
  thinkH4: '#6a6a6a',
  thinkCodePlain: '#8a8a8a',
  thinkCodeFallback: '#8a9a68',

  codeComment: '#4a8a3d',
  codeString: '#a05f42',
  codeNumber: '#4a8a44',
  codeKeyword: '#8f4a88',
  codeFunction: '#7a7a3d',
  codeType: '#2a7a6e',
  codeVariable: '#3a76a8',
  codeConstant: '#3a76a8',
  codeOperator: '#333333',

  thinkCodeComment: '#7aa87e',
  thinkCodeString: '#b07a6a',
  thinkCodeNumber: '#6a9c8a',
  thinkCodeKeyword: '#a87ca5',
  thinkCodeFunction: '#9a8a5e',
  thinkCodeType: '#5aa396',
  thinkCodeVariable: '#6a92b5',
  thinkCodeConstant: '#4a92c0',
}

export const palettes: Record<ThemeMode, Theme> = { dark: darkPalette, light: lightPalette }

export const COLORS: Theme = { ...darkPalette }

let currentMode: ThemeMode = 'dark'

export function themeMode(): ThemeMode {
  return currentMode
}

function rederivePermissionModes(): void {
  Object.assign(PERMISSION_MODES, {
    'workspace-write': { color: COLORS.permissionBackground, textColor: COLORS.workspaceWriteText, name: 'Workspace Write' },
    'danger-full-access': { color: COLORS.permissionBackground, textColor: COLORS.dangerFullAccessText, name: 'Full access' },
    'read-only': { color: COLORS.permissionBackground, textColor: COLORS.readOnlyText, name: 'Read Only' },
  })
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
  rederivePermissionModes()
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

export const PERMISSION_MODES: Record<PermissionModeId, { color: string; textColor: string; name: string }> = {
  'workspace-write': { color: COLORS.permissionBackground, textColor: COLORS.workspaceWriteText, name: 'Workspace Write' },
  'danger-full-access': { color: COLORS.permissionBackground, textColor: COLORS.dangerFullAccessText, name: 'Full access' },
  'read-only': { color: COLORS.permissionBackground, textColor: COLORS.readOnlyText, name: 'Read Only' },
} as const

materialize(currentMode)

export function permissionModeInfo(mode: string): { color: string; textColor: string; name: string } {
  return PERMISSION_MODES[mode as keyof typeof PERMISSION_MODES]
    ?? { color: COLORS.permissionBackground, textColor: COLORS.workspaceWriteText, name: mode }
}
