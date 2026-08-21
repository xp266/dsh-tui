export const colors = {
  userBubbleBackground: '#2f2f2f',
  aiBubbleBackground: '#0e0e0e',

  permissionBackground: '#232323',
  workspaceWriteText: '#3394e3',
  dangerFullAccessText: '#be2020',
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

  cwdText: '#ffffff',
  statsText: '#ffffff',

  errorText: '#ff6b6b',
  success: '#4caf50',

  toolLabel: '#4da0bc',
  thinkingLabel: '#0f9fcf',
  toolBodyText: '#808080',

  selectionBg: '#577187',
  selectionFg: '#000000',

  mdBold: '#cc7e25',
  mdInlineCode: '#4caf50',
  mdList: '#cc7e25',
  mdH1: '#c678dd',
  mdH2: '#c678dd',
  mdH3: '#5fd7ff',
  mdCode: '#d4d4d4',
  mdCodeNoLang: '#5fd7ff',

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
  codeOperatorDark: '#9a9a9a',
  codeNoLangDark: '#3f96b3',

  thinkInlineCode: '#2e7d32',
  thinkQuote: '#9a6a4a',
} as const

export const permissionModes = {
  'workspace-write': { color: colors.permissionBackground, textColor: colors.workspaceWriteText, name: 'Workspace Write' },
  'danger-full-access': { color: '#232323', textColor: colors.dangerFullAccessText, name: 'Full access' },
  'read-only': { color: '#232323', textColor: colors.readOnlyText, name: 'Read Only' },
} as const

export function permissionModeInfo(mode: string): { color: string; textColor: string; name: string } {
  return permissionModes[mode as keyof typeof permissionModes]
    ?? { color: colors.permissionBackground, textColor: colors.workspaceWriteText, name: mode }
}