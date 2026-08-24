const palette = {
  userBubbleBackground: '#2f2f2f',
  aiBubbleBackground: '#0e0e0e',

  permissionBackground: '#232323',
  workspaceWriteText: '#3394e3',
  dangerFullAccessText: '#d54d4d',
  readOnlyText: '#2d9c54',

  dialogBackground: '#000000',
  dialogInputBackground: '#2f2f2f',
  dialogHintText: '#808080',
  carouselCurrentBg: '#2e2e2e',
  carouselButtonBg: '#1a1a1a',
  carouselButtonPressedBg: '#3a3a3a',

  sectionHeader: '#cc7e25',

  modelText: '#ffffff',
  effortText: '#ffd900',
  statusSeparator: '#aaaaaa',
  presetText: '#aaaaaa',

  cwdText: '#aaaaaa',
  statsText: '#aaaaaa',

  errorText: '#ff6b6b',
  success: '#4caf50',

  toolLabel: '#4da0bc',
  thinkingLabel: '#0f9fcf',
  toolBodyText: '#808080',

  selectionBg: '#577187',
  selectionFg: '#000000',

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

  codeComment: '#6a9955',
  codeString: '#ce9178',
  codeNumber: '#b5cea8',
  codeKeyword: '#c586c0',
  codeFunction: '#dcdcaa',
  codeType: '#4ec9b0',
  codeVariable: '#9cdcfe',
  codeConstant: '#4fc1ff',
  codeOperator: '#d4d4d4',

  codeCommentDark: '#4e7a3f',
  codeStringDark: '#93684f',
  codeNumberDark: '#7f9c73',
  codeKeywordDark: '#8d5c8a',
  codeFunctionDark: '#9c9a6e',
  codeTypeDark: '#38897a',
  codeVariableDark: '#6e9cb3',
  codeConstantDark: '#3888b3',
} as const

export interface Theme extends Readonly<Record<keyof typeof palette, string>> {}

export const colors: Theme = palette

export const permissionModes = {
  'workspace-write': { color: colors.permissionBackground, textColor: colors.workspaceWriteText, name: 'Workspace Write' },
  'danger-full-access': { color: colors.permissionBackground, textColor: colors.dangerFullAccessText, name: 'Full access' },
  'read-only': { color: colors.permissionBackground, textColor: colors.readOnlyText, name: 'Read Only' },
} as const

export function permissionModeInfo(mode: string): { color: string; textColor: string; name: string } {
  return permissionModes[mode as keyof typeof permissionModes]
    ?? { color: colors.permissionBackground, textColor: colors.workspaceWriteText, name: mode }
}
