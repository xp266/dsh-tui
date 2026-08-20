import { useState } from 'react'
import type { Ref } from 'react'
import { colors, permissionModeInfo } from '../../theme.ts'
import type { PresetSummary } from '../../chat/presets.ts'
import { errorText } from '../../utils/text.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogRow } from './dialog.tsx'

export interface DefaultsApi {
  listPresets(): Promise<PresetSummary[]>
  defaultPresetId(): string
  setDefaultPreset(id: string): Promise<void>
  listPermissionPresets(): Promise<string[]>
  defaultPermission(): string
  setDefaultPermission(id: string): Promise<void>
}

export interface DefaultsDialogProps {
  api: DefaultsApi
  onClose: () => void
  ref?: Ref<DialogHandle>
}

const DIALOG_WIDTH = 70
const DIALOG_MAX_HEIGHT = 14

interface DefaultsData {
  presets: PresetSummary[]
  permissions: string[]
}

export function DefaultsDialog({ api, onClose, ref }: DefaultsDialogProps) {
  const { items, loading, error } = useAsyncList<DefaultsData>(async () => {
    const [presetList, permissionList] = await Promise.all([api.listPresets(), api.listPermissionPresets()])
    return [{ presets: presetList, permissions: permissionList }]
  })
  const [presetDefault, setPresetDefault] = useState(api.defaultPresetId())
  const [permissionDefault, setPermissionDefault] = useState(api.defaultPermission())
  const [saveError, setSaveError] = useState<string | null>(null)
  const presets = items[0]?.presets ?? []
  const permissionIds = items[0]?.permissions ?? []
  const savePreset = async (id: string) => {
    setPresetDefault(id)
    try {
      await api.setDefaultPreset(id)
      setSaveError(null)
    } catch (cause) {
      setPresetDefault(api.defaultPresetId())
      setSaveError(errorText(cause))
    }
  }
  const savePermission = async (id: string) => {
    setPermissionDefault(id)
    try {
      await api.setDefaultPermission(id)
      setSaveError(null)
    } catch (cause) {
      setPermissionDefault(api.defaultPermission())
      setSaveError(errorText(cause))
    }
  }
  const presetIds = presets.map(preset => preset.id)
  const presetNames = presets.map(preset => preset.name)
  const presetValue = presetNames[presetIds.indexOf(presetDefault)] ?? presetDefault
  const permissionNames = permissionIds.map(id => permissionModeInfo(id).name)
  const permissionValue = permissionNames[permissionIds.indexOf(permissionDefault)] ?? permissionDefault
  const rows: DialogRow[] = [
    {
      items: [
        {
          type: 'select',
          label: 'Agent Preset',
          value: presetValue,
          options: presetNames,
          onChange: name => {
            const id = presetIds[presetNames.indexOf(name)]
            if (id !== undefined) void savePreset(id)
          },
          spaced: true,
        },
      ],
    },
    {
      items: [
        {
          type: 'select',
          label: 'Permission Mode',
          value: permissionValue,
          options: permissionNames,
          onChange: name => {
            const id = permissionIds[permissionNames.indexOf(name)]
            if (id !== undefined) void savePermission(id)
          },
          spaced: true,
        },
      ],
    },
  ]
  const footer: DialogFooterLine[] = [
    ...(loading ? [{ text: 'loading…', color: colors.toolBodyText }] : []),
    ...(error !== null ? [{ text: error, color: colors.errorText }] : []),
    ...(saveError !== null ? [{ text: saveError, color: colors.errorText }] : []),
  ]
  return (
    <Dialog
      ref={ref}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="defaults"
      rows={rows}
      footer={footer}
      onClose={onClose}
      onConfirmLast={onClose}
    />
  )
}