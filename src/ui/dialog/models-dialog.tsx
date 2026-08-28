import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ConfiguredModel, CustomProviderForm, ModelEffortKey, ModelEntryConfig, OfficialProvider } from '../../chat/models.ts'
import { API_PROTOCOLS, isProviderIdValid, MODEL_EFFORT_LEVELS, PI_AI_SETTINGS_NS } from '../../chat/models.ts'
import { colors } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'
import { ListDialog } from './list-dialog.tsx'
import { DIALOG_WIDTH_MEDIUM, MODELS_DIALOG_MAX_HEIGHT } from './sizes.ts'

export interface ModelApi {
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
  listProviderDirectory(): Promise<OfficialProvider[]>
  fetchProviderModels(provider: OfficialProvider, apiKey: string): Promise<LlmDiscoveredModel[]>
  saveBuiltinProvider(provider: OfficialProvider, apiKey: string, models: LlmDiscoveredModel[]): Promise<void>
  readModelEntries(ns: string, provider: string): ModelEntryConfig[]
  saveModelEntry(ns: string, provider: string, entry: ModelEntryConfig): Promise<void>
  deleteModelEntry(ns: string, provider: string, modelId: string): Promise<void>
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
  | { kind: 'configure-model' }

const DIALOG_WIDTH = DIALOG_WIDTH_MEDIUM
const DIALOG_MAX_HEIGHT = MODELS_DIALOG_MAX_HEIGHT

const EMPTY_FORM: CustomProviderForm = {
  providerId: '',
  displayName: '',
  apiUrl: '',
  apiProtocol: API_PROTOCOLS[0],
  apiKey: '',
}

export function ModelsDialog({ api, onClose, onModelSelected, ref }: ModelsDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'list' })
  const { error, setError, clearError, run } = useAsyncAction()
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [form, setForm] = useState<CustomProviderForm>(EMPTY_FORM)
  const [provider, setProvider] = useState<OfficialProvider | null>(null)
  const [providerKey, setProviderKey] = useState('')
  const [discovered, setDiscovered] = useState<LlmDiscoveredModel[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [fetching, setFetching] = useState(false)
  const fetchingRef = useRef(false)
  const { items: models, loading, error: loadError, remove: removeModel, reload } = useAsyncList(api.listModels)
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armedRef = useRef<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const modelItemRefs = useRef(new Map<DialogItem, ConfiguredModel>())
  modelItemRefs.current = new Map()
  const [configTarget, setConfigTarget] = useState<ConfiguredModel | null>(null)
  const [configDraft, setConfigDraft] = useState<{ contextWindow: string; maxTokens: string; efforts: ReadonlySet<ModelEffortKey> }>({
    contextWindow: '',
    maxTokens: '',
    efforts: new Set(),
  })
  const disarm = () => {
    clearTimeout(armTimer.current)
    if (armedRef.current !== null) {
      armedRef.current = null
      setArmedKey(null)
    }
  }
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
  const openConfigure = (model: ConfiguredModel) => {
    const settings = api.readModelEntries(PI_AI_SETTINGS_NS, model.provider).find(entry => entry.id === model.id)
    setConfigTarget(model)
    setConfigDraft({
      contextWindow: settings?.contextWindow === undefined ? '' : String(settings.contextWindow),
      maxTokens: settings?.maxTokens === undefined ? '' : String(settings.maxTokens),
      efforts: new Set(
        settings?.reasoningEfforts === false || settings?.reasoningEfforts === undefined
          ? []
          : (Object.keys(settings.reasoningEfforts) as ModelEffortKey[]),
      ),
    })
    clearError()
    setWindow({ kind: 'configure-model' })
  }
  const submitConfigure = async () => {
    if (configTarget === null) return
    await run(async () => {
      const contextWindow = configDraft.contextWindow.trim() === '' ? undefined : Number(configDraft.contextWindow)
      const maxTokens = configDraft.maxTokens.trim() === '' ? undefined : Number(configDraft.maxTokens)
      if (contextWindow !== undefined && (!Number.isInteger(contextWindow) || contextWindow <= 0)) {
        throw new Error('Context window must be a positive integer')
      }
      if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
        throw new Error('Max tokens must be a positive integer')
      }
      const efforts = configDraft.efforts
      const reasoningEfforts = efforts.size === 0
        ? undefined
        : Object.fromEntries([...efforts].map(level => [level, level === 'off' ? null : level])) as Partial<Record<ModelEffortKey, string | null>>
      const entry: ModelEntryConfig = {
        id: configTarget.id,
        ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(maxTokens === undefined ? {} : { maxTokens }),
        ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
      }
      await api.saveModelEntry(PI_AI_SETTINGS_NS, configTarget.provider, entry)
      setConfigTarget(null)
      clearError()
      setWindow({ kind: 'list' })
      reload()
    })
  }
  const handleCtrlD = (model: ConfiguredModel): boolean => {
    const key = `${model.provider}/${model.id}`
    if (armedRef.current === key) {
      disarm()
      void run(async () => {
        await api.deleteModelEntry(PI_AI_SETTINGS_NS, model.provider, model.id)
        removeModel(candidate => candidate.provider === model.provider && candidate.id === model.id)
        reload()
      })
      return true
    }
    clearTimeout(armTimer.current)
    armedRef.current = key
    setArmedKey(key)
    armTimer.current = setTimeout(disarm, 3000)
    return true
  }
  const handleCtrlE = (model: ConfiguredModel): boolean => {
    openConfigure(model)
    return true
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
  const toggleEffort = (level: ModelEffortKey) => {
    setConfigDraft(current => {
      const next = new Set(current.efforts)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return { ...current, efforts: next }
    })
  }
  const configureRows: DialogRow[] = configTarget === null ? [] : [
    { items: [{ type: 'static', label: `Configure ${configTarget.name} (${configTarget.provider})` }] },
    {
      items: [
        { type: 'input', label: 'Context Window', value: configDraft.contextWindow, onChange: value => setConfigDraft(current => ({ ...current, contextWindow: value })) },
      ],
    },
    {
      items: [
        { type: 'input', label: 'Max Tokens', value: configDraft.maxTokens, onChange: value => setConfigDraft(current => ({ ...current, maxTokens: value })) },
      ],
    },
    {
      items: [
        { type: 'static', label: 'Reasoning levels (Space to toggle)' },
      ],
    },
    ...MODEL_EFFORT_LEVELS.map(level => ({
      items: [
        {
          type: 'checkbox' as const,
          label: level,
          checked: configDraft.efforts.has(level),
          onToggle: () => toggleEffort(level),
          onConfirm: () => void submitConfigure(),
        },
      ],
    })),
    {
      items: [
        { type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm: () => void submitConfigure(), onCancel: () => setWindow({ kind: 'list' }) },
      ],
    },
  ]
  const footerLines: DialogFooterLine[] = [
    ...(window.kind === 'select-models' ? [{ text: 'Press Space to toggle, Enter to confirm', color: colors.dialogHintText }] : []),
    ...(fetching && (window.kind === 'add-provider-key' || window.kind === 'add-custom') ? [{ text: 'Fetching models...' }] : []),
    ...(error !== null ? [errorLine(error)] : []),
  ]
  if (window.kind === 'configure-model') {
    return (
      <Dialog
        ref={ref}
        key="configure-model"
        width={DIALOG_WIDTH}
        maxHeight={DIALOG_MAX_HEIGHT}
        title="Configure Model"
        rows={configureRows}
        footer={footerLines}
        onClose={onClose}
      />
    )
  }
  const listRows: DialogRow[] = []
  const hasModels = models.length > 0
  if (hasModels) {
    listRows.push({ items: [{ type: 'header', label: 'Models' }] })
    for (const model of models) {
      const key = `${model.provider}/${model.id}`
      const armed = armedKey === key
      const item: DialogItem = {
        type: 'button',
        label: model.name,
        right: armed ? 'Press Ctrl+D again to delete' : model.providerName,
        onPress: () => void selectModel(model),
        ...(armed ? { rightColor: colors.errorText } : {}),
      }
      modelItemRefs.current.set(item, model)
      listRows.push({ items: [item] })
    }
  }
  listRows.push({ items: [{ type: 'header', label: 'Providers', leadingBlank: hasModels }] })
  listRows.push(
    { items: [{ type: 'button', label: '+Add DeepSeek', onPress: () => setWindow({ kind: 'add-deepseek' }) }] },
    { items: [{ type: 'button', label: '+Add Provider', onPress: openAddProvider }] },
    { items: [{ type: 'button', label: '+Add Custom Provider', onPress: () => setWindow({ kind: 'add-custom' }) }] },
  )
  if (window.kind === 'list') {
    const statusLine: DialogFooterLine | undefined = loading
      ? loadingLine()
      : loadError !== null
        ? errorLine(loadError)
        : undefined
    const listFooter: DialogFooterLine[] = [
      ...(statusLine === undefined ? [] : [statusLine]),
      ...(hasModels ? [{ text: 'Ctrl+D delete · Ctrl+E configure', color: colors.dialogHintText } as DialogFooterLine] : []),
      ...footerLines,
    ]
    const handleCtrlDItem = (focused: DialogItem | undefined): boolean => {
      const model = focused === undefined ? undefined : modelItemRefs.current.get(focused)
      return model === undefined ? false : handleCtrlD(model)
    }
    const handleCtrlEItem = (focused: DialogItem | undefined): boolean => {
      const model = focused === undefined ? undefined : modelItemRefs.current.get(focused)
      return model === undefined ? false : handleCtrlE(model)
    }
    return (
      <Dialog
        key="list"
        ref={ref}
        width={DIALOG_WIDTH}
        maxHeight={DIALOG_MAX_HEIGHT}
        title="model"
        rows={listRows}
        footer={listFooter}
        onClose={onClose}
        search
        searchRight
        onCtrlD={handleCtrlDItem}
        onCtrlE={handleCtrlEItem}
        onActivity={disarm}
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
