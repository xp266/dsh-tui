import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ConfiguredModel, CustomProviderForm, OfficialProvider } from '../../chat/models.ts'
import { API_PROTOCOLS } from '../../chat/models.ts'
import { colors } from '../../theme.ts'
import { errorLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogRow } from './dialog.tsx'
import { ListDialog } from './list-dialog.tsx'

export interface ModelApi {
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
  listProviderDirectory(): Promise<OfficialProvider[]>
  fetchProviderModels(provider: OfficialProvider, apiKey: string): Promise<LlmDiscoveredModel[]>
  saveBuiltinProvider(provider: OfficialProvider, apiKey: string, models: LlmDiscoveredModel[]): Promise<void>
}

export interface ModelsDialogProps {
  api: ModelApi
  onClose: () => void
  onModelSelected: (provider: string, model: string) => void
  ref?: Ref<DialogHandle>
}

type Window =
  | { kind: 'list' }
  | { kind: 'add-deepseek' }
  | { kind: 'add-provider' }
  | { kind: 'add-provider-key' }
  | { kind: 'add-custom' }
  | { kind: 'select-models' }

const DIALOG_WIDTH = 60
const DIALOG_MAX_HEIGHT = 22

const EMPTY_FORM: CustomProviderForm = {
  providerId: '',
  displayName: '',
  apiUrl: '',
  apiProtocol: API_PROTOCOLS[0],
  apiKey: '',
}

export function ModelsDialog({ api, onClose, onModelSelected, ref }: ModelsDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'list' })
  const { error, clearError, run } = useAsyncAction()
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [form, setForm] = useState<CustomProviderForm>(EMPTY_FORM)
  const [provider, setProvider] = useState<OfficialProvider | null>(null)
  const [providerKey, setProviderKey] = useState('')
  const [discovered, setDiscovered] = useState<LlmDiscoveredModel[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [fetching, setFetching] = useState(false)
  const fetchingRef = useRef(false)
  const openAddProvider = () => {
    clearError()
    setWindow({ kind: 'add-provider' })
  }
  const selectDirectoryProvider = (entry: OfficialProvider) => {
    clearError()
    setProvider(entry)
    setProviderKey('')
    setWindow({ kind: 'add-provider-key' })
  }
  const selectModel = async (model: ConfiguredModel) => {
    await run(async () => {
      await api.selectModel(model.provider, model.id)
      onModelSelected(model.provider, model.id)
      onClose()
    })
  }
  const submitDeepSeek = async () => {
    await run(async () => {
      await api.addDeepSeekKey(deepSeekKey)
      setDeepSeekKey('')
      clearError()
      setWindow({ kind: 'list' })
    })
  }
  const setField = <K extends keyof CustomProviderForm>(key: K, value: CustomProviderForm[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }
  const submitCustom = async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    clearError()
    setFetching(true)
    await run(async () => {
      const found = await api.fetchCustomModels(form)
      if (found.length === 0) throw new Error('Failed to fetch models')
      setDiscovered(found)
      setPicked(new Set())
      clearError()
      setWindow({ kind: 'select-models' })
    })
    fetchingRef.current = false
    setFetching(false)
  }
  const submitProvider = async () => {
    if (provider === null || fetchingRef.current) return
    fetchingRef.current = true
    clearError()
    setFetching(true)
    await run(async () => {
      const found = await api.fetchProviderModels(provider, providerKey)
      if (found.length === 0) throw new Error('Failed to fetch models')
      setDiscovered(found)
      setPicked(new Set())
      clearError()
      setWindow({ kind: 'select-models' })
    })
    fetchingRef.current = false
    setFetching(false)
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
    await run(async () => {
      if (picked.size === 0) throw new Error('Select at least one model')
      const chosen = discovered.filter(model => picked.has(model.id))
      if (provider !== null) {
        await api.saveBuiltinProvider(provider, providerKey, chosen)
        setProvider(null)
        setProviderKey('')
      } else {
        await api.saveCustomProvider(form, chosen)
        setForm(EMPTY_FORM)
      }
      clearError()
      setWindow({ kind: 'list' })
    })
  }
  const deepSeekRows: DialogRow[] = [
    {
      items: [
        { type: 'input', label: 'API Key', value: deepSeekKey, onChange: setDeepSeekKey },
      ],
    },
    {
      items: [
        { type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => void submitDeepSeek(), onCancel: onClose },
      ],
    },
  ]
  const providerKeyRows: DialogRow[] = [
    {
      items: [
        { type: 'input', label: 'API Key', value: providerKey, onChange: setProviderKey },
      ],
    },
    {
      items: [
        { type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => void submitProvider(), onCancel: onClose },
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
          spaced: true,
        },
      ],
    },
    {
      items: [
        { type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => void submitCustom(), onCancel: onClose },
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
  const footerLines: DialogFooterLine[] = [
    ...(window.kind === 'select-models' ? [{ text: 'Press Space to toggle, Enter to confirm', color: colors.dialogHintText }] : []),
    ...(fetching && (window.kind === 'add-provider-key' || window.kind === 'add-custom') ? [{ text: 'Fetching models...' }] : []),
    ...(error !== null ? [errorLine(error)] : []),
  ]
  if (window.kind === 'list') {
    return (
      <ListDialog
        key="list"
        ref={ref}
        width={DIALOG_WIDTH}
        maxHeight={DIALOG_MAX_HEIGHT}
        title="model"
        load={api.listModels}
        search
        staticRows={[
          { items: [{ type: 'button', label: '+Add DeepSeek', onPress: () => setWindow({ kind: 'add-deepseek' }) }] },
          { items: [{ type: 'button', label: '+Add Provider', onPress: openAddProvider }] },
          { items: [{ type: 'button', label: '+Add Custom Provider', onPress: () => setWindow({ kind: 'add-custom' }) }] },
        ]}
        labelOf={model => model.name}
        rightOf={model => model.providerName}
        onSelect={model => void selectModel(model)}
        onClose={onClose}
        footerLines={footerLines}
      />
    )
  }
  if (window.kind === 'add-provider') {
    return (
      <ListDialog
        key="add-provider"
        ref={ref}
        width={DIALOG_WIDTH}
        maxHeight={DIALOG_MAX_HEIGHT}
        title="Add Provider"
        load={api.listProviderDirectory}
        search
        labelOf={entry => entry.displayName || entry.provider}
        onSelect={selectDirectoryProvider}
        onClose={onClose}
        footerLines={footerLines}
      />
    )
  }
  const title =
    window.kind === 'add-deepseek'
      ? 'Add DeepSeek'
      : window.kind === 'add-provider-key'
        ? `Add ${provider?.displayName ?? provider?.provider ?? ''}`
        : window.kind === 'add-custom'
          ? 'Add Custom Provider'
          : 'Select Models'
  const rows = window.kind === 'add-deepseek'
    ? deepSeekRows
    : window.kind === 'add-provider-key'
      ? providerKeyRows
      : window.kind === 'add-custom'
        ? customRows
        : selectRows
  return (
    <Dialog
      ref={ref}
      key={window.kind}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title={title}
      rows={rows}
      footer={footerLines}
      onClose={onClose}
      search={window.kind === 'select-models'}
    />
  )
}
