import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ConfiguredModel, CustomProviderForm, ModelEffortKey, ModelEntryConfig, OfficialProvider } from '../../chat/models.ts'
import { MODEL_EFFORT_LEVELS, PI_AI_SETTINGS_NS } from '../../chat/models.ts'
import { COLORS } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'
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
  onAddProvider: () => void
  ref?: Ref<DialogHandle>
}

type Window =
  | { kind: 'list' }
  | { kind: 'configure-model' }


export function ModelsDialog({ api, onClose, onModelSelected, onAddProvider, ref }: ModelsDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'list' })
  const { error, clearError, run } = useAsyncAction()
  const { items: models, loading, error: loadError, reload } = useAsyncList(api.listModels)
  const modelItemRefs = useRef(new Map<DialogItem, ConfiguredModel>())
  modelItemRefs.current = new Map()
  const [configTarget, setConfigTarget] = useState<ConfiguredModel | null>(null)
  const [configDraft, setConfigDraft] = useState<{ contextWindow: string; maxTokens: string; efforts: ReadonlySet<ModelEffortKey> }>({
    contextWindow: '',
    maxTokens: '',
    efforts: new Set(),
  })
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
  const handleCtrlE = (model: ConfiguredModel): boolean => {
    openConfigure(model)
    return true
  }
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
  const footerLines: DialogFooterLine[] = error !== null ? [errorLine(error)] : []
  if (window.kind === 'configure-model') {
    return (
      <Dialog
        ref={ref}
        key="configure-model"
        width={DIALOG_WIDTH_MEDIUM}
        maxHeight={MODELS_DIALOG_MAX_HEIGHT}
        title="Configure Model"
        rows={configureRows}
        footer={footerLines}
        onClose={onClose}
      />
    )
  }
  const listRows: DialogRow[] = models.map(model => {
    const item: DialogItem = {
      type: 'button',
      label: model.name,
      right: model.providerName,
      onPress: () => void selectModel(model),
    }
    modelItemRefs.current.set(item, model)
    return { items: [item] }
  })
  const statusLine: DialogFooterLine | undefined = loading
    ? loadingLine()
    : loadError !== null
      ? errorLine(loadError)
      : undefined
  const listFooter: DialogFooterLine[] = [
    {
      text: 'Ctrl+A add providers · Ctrl+E configure',
      color: COLORS.dialogHintText,
    },
    ...(statusLine === undefined ? [] : [statusLine]),
    ...footerLines,
  ]
  const handleCtrlEItem = (focused: DialogItem | undefined): boolean => {
    const model = focused === undefined ? undefined : modelItemRefs.current.get(focused)
    return model === undefined ? false : handleCtrlE(model)
  }
  return (
    <Dialog
      key="list"
      ref={ref}
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={MODELS_DIALOG_MAX_HEIGHT}
      title="models"
      rows={listRows}
      footer={listFooter}
      onClose={onClose}
      search
      searchRight
      onCtrlA={(_focused) => {
        onAddProvider()
        return true
      }}
      onCtrlE={handleCtrlEItem}
    />
  )
}