import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { CustomProviderForm, OfficialProvider } from '../../chat/models.ts'
import { API_PROTOCOLS, isProviderIdValid } from '../../chat/models.ts'
import { DIALOG_COLORS } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'
import { DIALOG_MAX_HEIGHT, DIALOG_WIDTH_MEDIUM } from './sizes.ts'
import type { ModelApi } from './models-dialog.tsx'

export interface ProvidersDialogProps {
  api: ModelApi
  onClose: () => void
  onModelSelected: (provider: string, model: string) => void
  ref?: Ref<DialogHandle>
}

type Window =
  | { kind: 'providers' }
  | { kind: 'add-provider-key' }
  | { kind: 'add-custom' }
  | { kind: 'select-models' }

const ARM_TIMEOUT_MS = 3000

const DELETE_HINT: DialogFooterLine[] = [
  { text: 'Ctrl+D to delete the custom provider', color: DIALOG_COLORS.dialogHintText },
]


const EMPTY_FORM: CustomProviderForm = {
  providerId: '',
  displayName: '',
  apiUrl: '',
  apiProtocol: API_PROTOCOLS[0],
  apiKey: '',
}

function sourceOf(entry: OfficialProvider): string {
  return entry.declared === true ? 'custom' : entry.settingsNs
}

export function ProvidersDialog({ api, onClose, onModelSelected, ref }: ProvidersDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'providers' })
  const { error, setError, clearError, run } = useAsyncAction()
  const [form, setForm] = useState<CustomProviderForm>(EMPTY_FORM)
  const [provider, setProvider] = useState<OfficialProvider | null>(null)
  const [providerKey, setProviderKey] = useState('')
  const [discovered, setDiscovered] = useState<LlmDiscoveredModel[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [fetching, setFetching] = useState(false)
  const fetchingRef = useRef(false)
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armedRef = useRef<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const providerItemRefs = useRef(new Map<DialogItem, OfficialProvider>())
  const providerItemMap = new Map<DialogItem, OfficialProvider>()
  useLayoutEffect(() => {
    providerItemRefs.current = providerItemMap
  })
  const { items: directory, loading, error: loadError, reload } = useAsyncList(api.listProviderDirectory)
  const disarm = () => {
    clearTimeout(armTimer.current)
    if (armedRef.current !== null) {
      armedRef.current = null
      setArmedKey(null)
    }
  }
  useEffect(() => () => clearTimeout(armTimer.current), [])
  const deleteProvider = async (entry: OfficialProvider) => {
    const result = await run(() => api.deleteProvider(entry))
    if (!result.ok) return
    clearError()
    reload()
  }
  const handleCtrlD = (focused: DialogItem | undefined): boolean => {
    if (focused?.type !== 'button') return false
    const entry = providerItemRefs.current.get(focused)
    if (entry === undefined || entry.declared !== true) return false
    if (armedRef.current === entry.provider) {
      disarm()
      void deleteProvider(entry)
      return true
    }
    clearTimeout(armTimer.current)
    armedRef.current = entry.provider
    setArmedKey(entry.provider)
    armTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS)
    return true
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
  const resetProvider = () => {
    setProvider(null)
    setProviderKey('')
  }
  const setField = <K extends keyof CustomProviderForm>(key: K, value: CustomProviderForm[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }
  const fetchIntoSelection = async (fetchModels: () => Promise<LlmDiscoveredModel[]>) => {
    const found = await fetchModels()
    if (found.length === 0) throw new Error('Failed to fetch models')
    setDiscovered(found)
    setPicked(new Set())
    clearError()
    setWindow({ kind: 'select-models' })
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
    await run(() => fetchIntoSelection(() => api.fetchCustomModels({ ...form, providerId: form.providerId.trim() })))
    fetchingRef.current = false
    setFetching(false)
  }
  const submitProviderKey = async () => {
    if (provider === null || fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    await run(async () => {
      if (providerKey.trim() !== '') await api.saveProviderKey(provider, providerKey)
      // A declared provider stores its models outright; this window only
      // manages the key, so discovery (which needs a catalog or a baseURL)
      // is for undeclared routes only.
      if (provider.declared === true) {
        resetProvider()
        clearError()
        setWindow({ kind: 'providers' })
        reload()
        return
      }
      const found = await api.fetchProviderModels(provider, providerKey)
      if (found === undefined) {
        resetProvider()
        clearError()
        setWindow({ kind: 'providers' })
        reload()
        return
      }
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
        await api.saveProviderModels(provider, chosen)
        resetProvider()
      } else {
        await api.saveCustomProvider(form, chosen)
        setForm(EMPTY_FORM)
      }
      clearError()
      setWindow({ kind: 'providers' })
      reload()
    })
  }
  const providerKeyRows: DialogRow[] = [
    {
      items: [
        { type: 'input', label: 'API Key', value: providerKey, onChange: setProviderKey },
      ],
    },
    {
      items: [
        { type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => void submitProviderKey(), onCancel: onClose },
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
  const statusLines: DialogFooterLine[] = [
    ...(window.kind === 'select-models' ? [{ text: 'Press Space to toggle, Enter to confirm', color: DIALOG_COLORS.dialogHintText }] : []),
    ...(window.kind === 'add-provider-key' && provider?.declared === true
      ? [{ text: 'Submit an empty key to keep the stored one', color: DIALOG_COLORS.dialogHintText }]
      : []),
    ...(fetching && (window.kind === 'add-provider-key' || window.kind === 'add-custom') ? [{ text: 'Fetching models...' }] : []),
  ]
  const errorLines: DialogFooterLine[] = error !== null ? [errorLine(error)] : []
  if (window.kind !== 'providers') {
    const title =
      window.kind === 'add-provider-key'
        ? `${provider?.declared === true ? 'Reset key' : 'Add'} ${provider?.displayName ?? provider?.provider ?? ''}`
        : window.kind === 'add-custom'
          ? 'Add Custom Provider'
          : 'Select Models'
    const rows = window.kind === 'add-provider-key'
      ? providerKeyRows
      : window.kind === 'add-custom'
        ? customRows
        : selectRows
    return (
      <Dialog
        ref={ref}
        key={window.kind}
        width={DIALOG_WIDTH_MEDIUM}
        maxHeight={DIALOG_MAX_HEIGHT}
        title={title}
        rows={rows}
        footer={statusLines}
        errors={errorLines}
        onClose={onClose}
        search={window.kind === 'select-models'}
        centerScroll={window.kind === 'select-models'}
      />
    )
  }
  const providerRows: DialogRow[] = [
    ...directory.map(entry => {
      const armed = armedKey === entry.provider
      const item: DialogItem = {
        type: 'button',
        label: entry.displayName || entry.provider,
        right: armed ? 'Press Ctrl+D again to delete' : sourceOf(entry),
        onPress: () => selectDirectoryProvider(entry),
        ...(armed ? { rightColor: DIALOG_COLORS.errorText } : {}),
      }
      providerItemMap.set(item, entry)
      return { items: [item] }
    }),
    {
      items: [
        { type: 'button', label: 'Custom Provider', right: 'add manually', onPress: openCustom },
      ],
    },
  ]
  const providerFooter: DialogFooterLine[] = [
    ...(loading ? [loadingLine()] : []),
    ...DELETE_HINT,
    ...statusLines,
  ]
  const providerErrors: DialogFooterLine[] = [
    ...(loadError !== null ? [errorLine(loadError)] : []),
    ...errorLines,
  ]
  return (
    <Dialog
      key="providers"
      ref={ref}
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="providers"
      rows={providerRows}
      footer={providerFooter}
      errors={providerErrors}
      onClose={onClose}
      search
      centerScroll
      onCtrlD={handleCtrlD}
      onActivity={disarm}
    />
  )
}