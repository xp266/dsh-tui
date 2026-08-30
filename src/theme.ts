import type { PERMISSION_PRESETS } from './chat/bridge.ts'

type PermissionModeId = typeof PERMISSION_PRESETS[number]

export type ThemeMode = 'dark' | 'light'

const darkPalette = {
  userBubbleBackground: '#262626',
  aiBubbleBackground: '#141414',

  permissionBackground: '#202020',
  workspaceWriteText: '#006eff',
  dangerFullAccessText: '#ffa600',
  readOnlyText: '#06b500',

  dialogBackground: '#000000',
  dialogInputBackground: '#2f2f2f',
  dialogHintText: '#808080',
  carouselCurrentBg: '#2e2e2e',
  carouselButtonBg: '#1a1a1a',
  carouselButtonPressedBg: '#3a3a3a',
  carouselSelectedText: '#ffae00',

  sectionHeader: '#ffae00',

  panelQuestionText: '#ffae00',
  modelText: '#ffffff',
  effortText: '#ffd900',
  statusSeparator: '#aaaaaa',
  presetText: '#aaaaaa',

  cwdText: '#aaaaaa',
  statsText: '#aaaaaa',

  errorText: '#ff6753',
  success: '#4caf50',
  warning: '#efa72e',

  toolLabel: '#00d0ff',
  toolBodyText: '#808080',

  diffAdded: '#00da1d',
  diffRemoved: '#d80b00',
  diffAddedBackground: '#15231f',
  diffRemovedBackground: '#543934',

  scrollTrackBackground: '#2b2b2b',
  scrollThumbBackground: '#5b5b5b',

  selectionBg: '#0066ff',
  selectionFg: '#ffffff',

  mdBold: '#cc7e25',
  mdLink: '#4da0e8',
  mdInlineCode: '#4caf50',
  mdQuoteBar: '#8a8a8a',
  mdHr: '#666666',
  mdList: '#cc7e25',
  mdTaskDone: '#4caf50',
  mdTaskTodo: '#909090',
  mdH1: '#c678dd',
  mdH2: '#c678dd',
  mdH3: '#5fd7ff',
  mdH4: '#61afef',
  mdCodePlain: '#d4d4d4',
  mdCodeFallback: '#b5bd68',

  thinkBold: '#8f6522',
  thinkLink: '#39698f',
  thinkInlineCode: '#2e7d32',
  thinkQuoteBar: '#585858',
  thinkHr: '#444444',
  thinkList: '#8f6522',
  thinkTaskDone: '#2e7d32',
  thinkTaskTodo: '#686868',
  thinkH1: '#8d5c8a',
  thinkH2: '#8d5c8a',
  thinkH3: '#3f96b3',
  thinkH4: '#45608a',
  thinkCodePlain: '#9a9a9a',
  thinkCodeFallback: '#708258',

  codeComment: '#4a9d24',
  codeString: '#e98862',
  codeNumber: '#80dc4e',
  codeKeyword: '#e177d8',
  codeFunction: '#f0f0a5',
  codeType: '#4ab9a3',
  codeVariable: '#1ca4ee',
  codeConstant: '#2e90c5',
  codeOperator: '#ffffff',

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
  dangerFullAccessText: '#b05f00',
  readOnlyText: '#0a8a14',

  dialogBackground: '#ffffff',
  dialogInputBackground: '#f0f0f0',
  dialogHintText: '#6e6e6e',
  carouselCurrentBg: '#efefef',
  carouselButtonBg: '#e3e3e3',
  carouselButtonPressedBg: '#d4d4d4',
  carouselSelectedText: '#a86800',

  sectionHeader: '#a86800',
  panelQuestionText: '#a86800',

  modelText: '#111111',
  effortText: '#8f7400',
  statusSeparator: '#6e6e6e',
  presetText: '#6e6e6e',

  cwdText: '#6e6e6e',
  statsText: '#6e6e6e',

  errorText: '#d44a3a',
  success: '#2e8b3d',
  warning: '#b97a00',

  toolLabel: '#0092b8',
  toolBodyText: '#6e6e6e',

  diffAdded: '#0a8a2c',
  diffRemoved: '#c22318',
  diffAddedBackground: '#ddf0ea',
  diffRemovedBackground: '#f5e8e5',

  scrollTrackBackground: '#e6dede',
  scrollThumbBackground: '#9a9a9a',

  selectionBg: '#0066ff',
  selectionFg: '#ffffff',

  mdBold: '#b06000',
  mdLink: '#2f6fd0',
  mdInlineCode: '#2e8b3d',
  mdQuoteBar: '#9a9a9a',
  mdHr: '#c8c8c8',
  mdList: '#b06000',
  mdTaskDone: '#2e8b3d',
  mdTaskTodo: '#8a8a8a',
  mdH1: '#8a3fc6',
  mdH2: '#8a3fc6',
  mdH3: '#007fa8',
  mdH4: '#2f6fd0',
  mdCodePlain: '#333333',
  mdCodeFallback: '#647a34',

  thinkBold: '#a37c3f',
  thinkLink: '#6a92b5',
  thinkInlineCode: '#5f9c67',
  thinkQuoteBar: '#b8b8b8',
  thinkHr: '#dcdcdc',
  thinkList: '#a37c3f',
  thinkTaskDone: '#5f9c67',
  thinkTaskTodo: '#a8a8a8',
  thinkH1: '#a584c2',
  thinkH2: '#a584c2',
  thinkH3: '#5aa8c0',
  thinkH4: '#7a94bd',
  thinkCodePlain: '#8a8a8a',
  thinkCodeFallback: '#8a9a68',

  codeComment: '#3d8a1e',
  codeString: '#ae5832',
  codeNumber: '#2e8a2a',
  codeKeyword: '#a23694',
  codeFunction: '#949420',
  codeType: '#17796a',
  codeVariable: '#0f66ad',
  codeConstant: '#0d5f95',
  codeOperator: '#222222',

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

function materialize(mode: ThemeMode): void {
  Object.assign(COLORS, palettes[mode])
  rederivePermissionModes()
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
