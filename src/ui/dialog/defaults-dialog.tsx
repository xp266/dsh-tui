import { useRef, useState } from 'react'
import type { Ref } from 'react'
import { permissionModeInfo } from '../../theme.ts'
import { deliveryChipLabel } from '../../core/fields.ts'
import { DELIVERY_MODES } from '../../core/delivery.ts'
import type { DeliveryMode } from '../../core/delivery.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import type { PresetSummary } from '../../chat/presets.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import { DIALOG_MAX_HEIGHT, DIALOG_WIDTH_MEDIUM } from './sizes.ts'
import type { DialogFooterLine, DialogHandle, DialogRow } from './dialog.tsx'

export interface DefaultsApi {
  listPresets(): Promise<PresetSummary[]>
  defaultPresetId(): string
  setDefaultPreset(id: string): Promise<void>
  listPermissionPresets(): Promise<string[]>
  defaultPermission(): string
  setDefaultPermission(id: string): Promise<void>
  defaultDeliveryMode(): DeliveryMode
  setDefaultDeliveryMode(mode: DeliveryMode): Promise<void>
}

export interface DefaultsDialogProps {
  api: DefaultsApi
  onClose: () => void
  title?: string
  ref?: Ref<DialogHandle>
}


interface DefaultsData {
  presets: PresetSummary[]
  permissions: string[]
}

function useSavedChoice<T>(read: () => T, write: (value: T) => Promise<void>): { value: T; save(value: T): void; error: string | null } {
  const [value, setValue] = useState(read)
  const { error, clearError, run } = useAsyncAction()
  const save = (next: T): void => {
    setValue(next)
    void run(() => write(next)).then(result => {
      if (result.ok) clearError()
      else setValue(read())
    })
  }
  return { value, save, error }
}

export function DefaultsDialog({ api, onClose, title = 'defaults', ref }: DefaultsDialogProps) {
  const { items, loading, error } = useAsyncList<DefaultsData>(async () => {
    const [presetList, permissionList] = await Promise.all([api.listPresets(), api.listPermissionPresets()])
    return [{ presets: presetList, permissions: permissionList }]
  })
  const presetChoice = useSavedChoice(() => api.defaultPresetId(), api.setDefaultPreset)
  const permissionChoice = useSavedChoice(() => api.defaultPermission(), api.setDefaultPermission)
  const deliveryChoice = useSavedChoice(() => api.defaultDeliveryMode(), api.setDefaultDeliveryMode)
  const saveError = presetChoice.error ?? permissionChoice.error ?? deliveryChoice.error
  const presets = items[0]?.presets ?? []
  const permissionIds = items[0]?.permissions ?? []
  const presetIds = presets.map(preset => preset.id)
  const presetNames = presets.map(preset => preset.name)
  const presetValue = presetNames[presetIds.indexOf(presetChoice.value)] ?? presetChoice.value
  const permissionNames = permissionIds.map(id => permissionModeInfo(id).name)
  const permissionValue = permissionNames[permissionIds.indexOf(permissionChoice.value)] ?? permissionChoice.value
  const deliveryNames = DELIVERY_MODES.map(deliveryChipLabel)
  const deliveryValue = deliveryChipLabel(deliveryChoice.value)
  const originalRef = useRef({
    preset: api.defaultPresetId(),
    permission: api.defaultPermission(),
    delivery: api.defaultDeliveryMode(),
  })
  const revertAndClose = async () => {
    const original = originalRef.current
    try {
      if (presetChoice.value !== original.preset) await api.setDefaultPreset(original.preset)
      if (permissionChoice.value !== original.permission) await api.setDefaultPermission(original.permission)
      if (deliveryChoice.value !== original.delivery) await api.setDefaultDeliveryMode(original.delivery)
    } catch {
      // A failed revert still closes the dialog; the values were already applied live.
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
            if (id !== undefined) presetChoice.save(id)
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
            if (id !== undefined) permissionChoice.save(id)
          },
          spaced: true,
        },
      ],
    },
    {
      items: [
        {
          type: 'select',
          label: 'Interjection Mode',
          value: deliveryValue,
          options: deliveryNames,
          onChange: name => {
            const mode = DELIVERY_MODES[deliveryNames.indexOf(name)]
            if (mode !== undefined) deliveryChoice.save(mode)
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
  const footer: DialogFooterLine[] = loading ? [loadingLine()] : []
  const errors: DialogFooterLine[] = [
    ...(error !== null ? [errorLine(error)] : []),
    ...(saveError !== null ? [errorLine(saveError)] : []),
  ]
  return (
    <Dialog
      ref={ref}
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={DIALOG_MAX_HEIGHT}
      title={title}
      rows={rows}
      footer={footer}
      errors={errors}
      onClose={onClose}
    />
  )
}
