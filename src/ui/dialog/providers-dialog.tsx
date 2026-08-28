import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { CustomProviderForm, OfficialProvider } from '../../chat/models.ts'
import { API_PROTOCOLS, isProviderIdValid } from '../../chat/models.ts'
import { colors } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogRow } from './dialog.tsx'
import { DIALOG_WIDTH_MEDIUM, MODELS_DIALOG_MAX_HEIGHT } from './sizes.ts'
import type { ModelApi } from './models-dialog.tsx'

export interface ProvidersDialogProps {
  api: ModelApi
  onClose: () => void
  onModelSelected: (provider: string, model: string) => void
  ref?: Ref<DialogHandle>
}

type Window =
  | { kind: 'providers' }
  | { kind: 'add-deepseek' }
  | { kind: 'add-provider-key' }
  | { kind: 'add-custom' }
  | { kind: 'select-models' }

const DIALOG_WIDTH = DIALOG_WIDTH_MEDIUM
const DIALOG_MAX_HEIGHT = MODELS_DIALOG_MAX_HEIGHT

const EMPTY_FORM: CustomProviderForm = {
  providerId: '',
  displayName: '',
  apiUrl: '',
  apiProtocol: API_PROTOCOLS[0],
  apiKey: '',
}

function sourceOf(entry: OfficialProvider): string {
  return entry.declared === false ? 'official plugin' : 'third-party plugin'
}

export function ProvidersDialog({ api, onClose, onModelSelected, ref }: ProvidersDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'providers' })
  const { error, setError, clearError, run } = useAsyncAction()
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [form, setForm] = useState<CustomProviderForm>(EMPTY_FORM)
  const [provider, setProvider] = useState<OfficialProvider | null>(null)
  const [providerKey, setProviderKey] = useState('')
  const [discovered, setDiscovered] = useState<LlmDiscoveredModel[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [fetching, setFetching] = useState(false)
  const fetchingRef = useRef(false)
  const { items: directory, loading, error: loadError, reload } = useAsyncList(api.listProviderDirectory)
  const openDeepSeek = () => {
    clearError()
    setWindow({ kind: 'add-deepseek' })
  }
  const openCustom = () => {
    clearError()
    setWindow({ kind: 'add-custom' })
  }
  const selectDirectoryProvider = (entry: OfficialProvider) => {
    clearError()
    setProvider(entry)
    setProviderKey('')
    setWindow({ kind: 'add-provider-key' })
  }
  const setField = <K extends keyof CustomProviderForm>(key: K, value: CustomProviderForm[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }
  const submitDeepSeek = async () => {
    await run(async () => {
      await api.addDeepSeekKey(deepSeekKey)
      setDeepSeekKey('')
      clearError()
      setWindow({ kind: 'providers' })
    })
  }
  const submitCustom = async () => {
    if (fetchingRef.current) return
    clearError()
    if (!isProviderIdValid(form.providerId.trim())) {
      setError('Provider ID must start with a letter and use only letters, digits, _ and -')
      return
    }
    fetchingRef.current = true
    setFetching(true)
    await run(async () => {
      const found = await api.fetchCustomModels({ ...form, providerId: form.providerId.trim() })
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
      setWindow({ kind: 'providers' })
      reload()
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
  if (window.kind !== 'providers') {
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
  const providerRows: DialogRow[] = [
    {
      items: [
        { type: 'button', label: 'DeepSeek', right: 'deepseek official', onPress: openDeepSeek },
      ],
    },
    ...directory
      .filter(entry => entry.provider !== 'deepseek')
      .map(entry => ({
        items: [
          { type: 'button', label: entry.displayName || entry.provider, right: sourceOf(entry), onPress: () => selectDirectoryProvider(entry) },
        ],
      })),
    {
      items: [
        { type: 'button', label: 'Custom Provider', right: 'custom', onPress: openCustom },
      ],
    },
  ]
  const statusLine: DialogFooterLine | undefined = loading
    ? loadingLine()
    : loadError !== null
      ? errorLine(loadError)
      : undefined
  const providerFooter: DialogFooterLine[] = [
    ...(statusLine === undefined ? [] : [statusLine]),
    ...footerLines,
  ]
  return (
    <Dialog
      key="providers"
      ref={ref}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="providers"
      rows={providerRows}
      footer={providerFooter}
      onClose={onClose}
      search
    />
  )
}