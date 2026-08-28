import { useRef, useState } from 'react'
import type { Ref } from 'react'
import { permissionModeInfo } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import type { PresetSummary } from '../../chat/presets.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import { DEFAULTS_DIALOG_MAX_HEIGHT, DIALOG_WIDTH_WIDE } from './sizes.ts'
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
  const { error: saveError, clearError: clearSaveError, run } = useAsyncAction()
  const presets = items[0]?.presets ?? []
  const permissionIds = items[0]?.permissions ?? []
  const savePreset = async (id: string) => {
    setPresetDefault(id)
    const result = await run(() => api.setDefaultPreset(id))
    if (result.ok) {
      clearSaveError()
      return
    }
    setPresetDefault(api.defaultPresetId())
  }
  const savePermission = async (id: string) => {
    setPermissionDefault(id)
    const result = await run(() => api.setDefaultPermission(id))
    if (result.ok) {
      clearSaveError()
      return
    }
    setPermissionDefault(api.defaultPermission())
  }
  const presetIds = presets.map(preset => preset.id)
  const presetNames = presets.map(preset => preset.name)
  const presetValue = presetNames[presetIds.indexOf(presetDefault)] ?? presetDefault
  const permissionNames = permissionIds.map(id => permissionModeInfo(id).name)
  const permissionValue = permissionNames[permissionIds.indexOf(permissionDefault)] ?? permissionDefault
  const originalRef = useRef({ preset: api.defaultPresetId(), permission: api.defaultPermission() })
  const revertAndClose = async () => {
    const original = originalRef.current
    try {
      if (presetDefault !== original.preset) await api.setDefaultPreset(original.preset)
      if (permissionDefault !== original.permission) await api.setDefaultPermission(original.permission)
    } catch {
    }
    onClose()
  }
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
    {
      items: [
        {
          type: 'actions',
          confirmLabel: 'Submit',
          cancelLabel: 'Cancel',
          onConfirm: onClose,
          onCancel: () => void revertAndClose(),
        },
      ],
    },
  ]
  const footer: DialogFooterLine[] = [
    ...(loading ? [loadingLine()] : []),
    ...(error !== null ? [errorLine(error)] : []),
    ...(saveError !== null ? [errorLine(saveError)] : []),
  ]
  return (
    <Dialog
      ref={ref}
      width={DIALOG_WIDTH_WIDE}
      maxHeight={DEFAULTS_DIALOG_MAX_HEIGHT}
      title="defaults"
      rows={rows}
      footer={footer}
      onClose={onClose}
    />
  )
}
