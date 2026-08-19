import { Text } from 'ink'
import { forwardRef, useCallback, useEffect, useState } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ConfiguredModel, CustomProviderForm } from '../../chat/models.ts'
import { API_PROTOCOLS } from '../../chat/models.ts'
import { colors } from '../../theme.ts'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import type { Ref } from 'react'

export interface ModelApi {
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
}

export interface ModelsDialogProps {
  api: ModelApi
  onClose: () => void
  onModelSelected: (provider: string, model: string) => void
}

type Window = { kind: 'list' } | { kind: 'add-deepseek' } | { kind: 'add-custom' } | { kind: 'select-models' }

const DIALOG_WIDTH = 60
const DIALOG_MAX_HEIGHT = 22

const EMPTY_FORM: CustomProviderForm = {
  providerId: '',
  displayName: '',
  apiUrl: '',
  apiProtocol: API_PROTOCOLS[0],
  apiKey: '',
}

export const ModelsDialog = forwardRef<DialogHandle, ModelsDialogProps>(function ModelsDialog(
  { api, onClose, onModelSelected },
  ref,
) {
  const [window, setWindow] = useState<Window>({ kind: 'list' })
  const [models, setModels] = useState<ConfiguredModel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [form, setForm] = useState<CustomProviderForm>(EMPTY_FORM)
  const [discovered, setDiscovered] = useState<LlmDiscoveredModel[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const loadModels = useCallback(async () => {
    try {
      setModels(await api.listModels())
      setError(null)
    } catch (cause) {
      setError(String(cause))
    }
  }, [api])
  useEffect(() => {
    void loadModels()
  }, [loadModels])
  const selectModel = async (model: ConfiguredModel) => {
    try {
      await api.selectModel(model.provider, model.id)
      onModelSelected(model.provider, model.id)
      onClose()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const submitDeepSeek = async () => {
    try {
      await api.addDeepSeekKey(deepSeekKey)
      setDeepSeekKey('')
      setError(null)
      setWindow({ kind: 'list' })
      void loadModels()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const setField = <K extends keyof CustomProviderForm>(key: K, value: CustomProviderForm[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }
  const submitCustom = async () => {
    try {
      const found = await api.fetchCustomModels(form)
      if (found.length === 0) {
        setError('Failed to fetch models')
        return
      }
      setDiscovered(found)
      setPicked(new Set())
      setError(null)
      setWindow({ kind: 'select-models' })
    } catch {
      setError('Failed to fetch models')
    }
  }
  const toggleModel = (id: string) => {
    setPicked(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const submitModels = async () => {
    if (picked.size === 0) {
      setError('Select at least one model')
      return
    }
    const chosen = discovered.filter(model => picked.has(model.id))
    try {
      await api.saveCustomProvider(form, chosen)
      setForm(EMPTY_FORM)
      setError(null)
      setWindow({ kind: 'list' })
      void loadModels()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const listRows: DialogRow[] = [
    {
      items: [{ type: 'button', label: '+Add Deepseek', onPress: () => setWindow({ kind: 'add-deepseek' }) }],
    },
    {
      items: [{ type: 'button', label: '+Add Custom Model', onPress: () => setWindow({ kind: 'add-custom' }) }],
    },
  ]
  for (const model of models) {
    listRows.push({
      items: [
        {
          type: 'button',
          label: model.name,
          right: model.providerName,
          onPress: () => void selectModel(model),
        },
      ],
    })
  }
  const deepSeekRows: DialogRow[] = [
    {
      items: [
        { type: 'input', label: 'API Key', value: deepSeekKey, onChange: setDeepSeekKey, onEnter: () => void submitDeepSeek() },
      ],
    },
  ]
  const customRows: DialogRow[] = [
    { items: [{ type: 'input', label: 'Provider ID', value: form.providerId, onChange: value => setField('providerId', value) }] },
    { items: [{ type: 'input', label: 'Display Name', value: form.displayName, onChange: value => setField('displayName', value) }] },
    { items: [{ type: 'input', label: 'API URL', value: form.apiUrl, onChange: value => setField('apiUrl', value) }] },
    {
      items: [
        {
          type: 'input',
          label: 'API Key',
          value: form.apiKey,
          onChange: value => setField('apiKey', value),
          onEnter: () => void submitCustom(),
        },
      ],
    },
    {
      items: [
        {
          type: 'select',
          label: 'API Protocol',
          value: form.apiProtocol,
          options: API_PROTOCOLS,
          onChange: value => setField('apiProtocol', value),
        },
      ],
    },
  ]
  const selectRows: DialogRow[] = discovered.map(model => ({
    items: [
      {
        type: 'checkbox',
        label: model.name ?? model.id,
        checked: picked.has(model.id),
        onToggle: () => toggleModel(model.id),
        onConfirm: () => void submitModels(),
      },
    ],
  }))
  const footer = (
    <>
      {window.kind === 'select-models' && <Text color={colors.toolBodyText}>Press Space to toggle, Enter to confirm</Text>}
      {error !== null && <Text color={colors.errorText}>{error}</Text>}
    </>
  )
  let title = 'model'
  let rows = listRows
  if (window.kind === 'add-deepseek') {
    title = 'Add Deepseek'
    rows = deepSeekRows
  } else if (window.kind === 'add-custom') {
    title = 'Add Custom Model'
    rows = customRows
  } else if (window.kind === 'select-models') {
    title = 'Select Models'
    rows = selectRows
  }
  return (
    <Dialog
      ref={ref as Ref<DialogHandle>}
      key={window.kind}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title={title}
      rows={rows}
      footer={footer}
      onClose={onClose}
      search={window.kind === 'list' || window.kind === 'select-models'}
    />
  )
})