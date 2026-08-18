export const colors = {
  userBubbleBackground: '#3a3a3a',
  aiBubbleBackground: '#464646',
  errorText: '#ff6b6b',
  toolLabel: '#5fd7ff',
  toolBodyText: '#808080',
  modelText: '#808080',
  cwdText: '#808080',
  success: '#4caf50',
  dialogBackground: '#000000',
} as const

export const permissionModes = {
  'workspace-write': { color: '#3a3a3a', name: 'Workspace Write' },
  'danger-full-access': { color: '#6b2a2a', name: 'Full access' },
  'read-only': { color: '#6b5f2a', name: 'Read Only' },
} as const

export function permissionModeInfo(mode: string): { color: string; name: string } {
  return permissionModes[mode as keyof typeof permissionModes] ?? { color: colors.userBubbleBackground, name: mode }
}