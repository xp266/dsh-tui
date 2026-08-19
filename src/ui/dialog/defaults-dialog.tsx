import { Text } from 'ink'
import { forwardRef, useEffect, useState } from 'react'
import type { PresetSummary } from '../../chat/presets.ts'
import { colors, permissionModeInfo } from '../../theme.ts'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import type { Ref } from 'react'

export interface DefaultsDialogProps {
  api: {
    listPresets(): Promise<PresetSummary[]>
    defaultPresetId(): string
    setDefaultPreset(id: string): Promise<void>
    listPermissionPresets(): Promise<string[]>
    defaultPermission(): string
    setDefaultPermission(id: string): Promise<void>
  }
  onClose: () => void
}

const DIALOG_WIDTH = 70
const DIALOG_MAX_HEIGHT = 14

export const DefaultsDialog = forwardRef<DialogHandle, DefaultsDialogProps>(function DefaultsDialog(
  { api, onClose },
  ref,
) {
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [permissionIds, setPermissionIds] = useState<string[]>([])
  const [presetDefault, setPresetDefault] = useState(api.defaultPresetId())
  const [permissionDefault, setPermissionDefault] = useState(api.defaultPermission())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [presetList, permissionList] = await Promise.all([api.listPresets(), api.listPermissionPresets()])
        setPresets(presetList)
        setPermissionIds(permissionList)
        setError(null)
      } catch (cause) {
        setError(String(cause))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [api])
  const savePreset = async (id: string) => {
    setPresetDefault(id)
    try {
      await api.setDefaultPreset(id)
      setError(null)
    } catch (cause) {
      setPresetDefault(api.defaultPresetId())
      setError(String(cause))
    }
  }
  const savePermission = async (id: string) => {
    setPermissionDefault(id)
    try {
      await api.setDefaultPermission(id)
      setError(null)
    } catch (cause) {
      setPermissionDefault(api.defaultPermission())
      setError(String(cause))
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
  const footer = loading
    ? <Text color={colors.toolBodyText}>loading…</Text>
    : error === null
      ? undefined
      : <Text color={colors.errorText}>{error}</Text>
  return (
    <Dialog
      ref={ref as Ref<DialogHandle>}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="defaults"
      rows={rows}
      footer={footer}
      onClose={onClose}
    />
  )
})