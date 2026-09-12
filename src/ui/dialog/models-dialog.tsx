import { useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ConfiguredModel, CustomProviderForm, DescribedModel, ModelEntryConfig, OfficialProvider } from '../../chat/models.ts'
import { PI_AI_SETTINGS_NS } from '../../chat/models.ts'
import { DIALOG_COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'
import { DIALOG_MAX_HEIGHT, DIALOG_WIDTH_MEDIUM } from './sizes.ts'

export interface ModelApi {
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
  listProviderDirectory(): Promise<OfficialProvider[]>
  fetchProviderModels(provider: OfficialProvider, apiKey: string): Promise<LlmDiscoveredModel[] | undefined>
  saveProviderKey(provider: OfficialProvider, apiKey: string): Promise<void>
  saveProviderModels(provider: OfficialProvider, models: LlmDiscoveredModel[]): Promise<void>
  deleteProvider(provider: OfficialProvider): Promise<void>
  readModelEntries(ns: string, provider: string): ModelEntryConfig[]
  describeModel(provider: string, model: string): Promise<DescribedModel>
  saveModelEntry(ns: string, provider: string, entry: ModelEntryConfig): Promise<void>
  deleteModelEntry(ns: string, provider: string, modelId: string): Promise<void>
}

export interface ModelsDialogProps {
  api: ModelApi
  onClose: () => void
  onModelSelected: (provider: string, model: string) => void
  onAddProvider: () => void
  /** Window label resolved by the shell against the active language. */
  windowTitle?: string
  ref?: Ref<DialogHandle>
}

type Window =
  | { kind: 'list' }
  | { kind: 'configure-model' }


export function ModelsDialog({ api, onClose, onModelSelected, onAddProvider, windowTitle = 'models', ref }: ModelsDialogProps) {
  const [window, setWindow] = useState<Window>({ kind: 'list' })
  const { error, clearError, run } = useAsyncAction()
  const { items: models, loading, error: loadError, reload } = useAsyncList(api.listModels)
  const modelItemRefs = useRef(new Map<DialogItem, ConfiguredModel>())
  const modelItemMap = new Map<DialogItem, ConfiguredModel>()
  useLayoutEffect(() => {
    modelItemRefs.current = modelItemMap
  })
  const [configTarget, setConfigTarget] = useState<ConfiguredModel | null>(null)
  const [configDraft, setConfigDraft] = useState<{ name: string; contextWindow: string; image: string }>({
    name: '',
    contextWindow: '',
    image: '',
  })
  const configureRequestRef = useRef(0)
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
      name: settings?.name ?? '',
      contextWindow: settings?.contextWindow === undefined ? '' : String(settings.contextWindow),
      image: settings?.input === undefined ? '' : String(settings.input.includes('image')),
    })
    clearError()
    setWindow({ kind: 'configure-model' })
    const request = ++configureRequestRef.current
    void api.describeModel(model.provider, model.id).then(info => {
      if (configureRequestRef.current !== request) return
      setConfigDraft(current => ({
        name: current.name === '' ? info.name : current.name,
        contextWindow: current.contextWindow === '' && info.contextWindow !== undefined ? String(info.contextWindow) : current.contextWindow,
        image: current.image === '' ? String(info.image) : current.image,
      }))
    }).catch(() => {
      // A failed describe leaves the config draft blank; the user fills the fields by hand.
    })
  }
  const submitConfigure = async () => {
    if (configTarget === null) return
    await run(async () => {
      const name = configDraft.name.trim()
      const contextWindow = configDraft.contextWindow.trim() === '' ? undefined : Number(configDraft.contextWindow)
      if (contextWindow !== undefined && (!Number.isInteger(contextWindow) || contextWindow <= 0)) {
        throw new Error('Context window must be a positive integer')
      }
      const image = configDraft.image.trim().toLowerCase()
      let input: string[] | undefined
      if (image !== '') {
        if (image !== 'true' && image !== 'false') throw new Error('imageModality must be true or false')
        input = image === 'true' ? ['text', 'image'] : ['text']
      }
      const existing = api.readModelEntries(PI_AI_SETTINGS_NS, configTarget.provider).find(entry => entry.id === configTarget.id)
      const entry: ModelEntryConfig = { ...existing, id: configTarget.id }
      if (name === '') delete entry.name
      else entry.name = name
      if (contextWindow === undefined) delete entry.contextWindow
      else entry.contextWindow = contextWindow
      if (input === undefined) delete entry.input
      else entry.input = input
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
  const configureRows: DialogRow[] = configTarget === null ? [] : [
    {
      items: [
        { type: 'input', label: 'name', value: configDraft.name, onChange: value => setConfigDraft(current => ({ ...current, name: value })) },
      ],
    },
    {
      items: [
        { type: 'input', label: 'contextWindow', value: configDraft.contextWindow, onChange: value => setConfigDraft(current => ({ ...current, contextWindow: value })) },
      ],
    },
    {
      items: [
        { type: 'input', label: 'imageModality', value: configDraft.image, onChange: value => setConfigDraft(current => ({ ...current, image: value })) },
      ],
    },
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
        maxHeight={DIALOG_MAX_HEIGHT}
        title="Configure Model"
        rows={configureRows}
        errors={footerLines}
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
    modelItemMap.set(item, model)
    return { items: [item] }
  })
  const listFooter: DialogFooterLine[] = [
    {
      text: `Ctrl+A add providers ${glyphs.separator} Ctrl+E configure`,
      color: DIALOG_COLORS.dialogHintText,
    },
    ...(loading ? [loadingLine()] : []),
  ]
  const listErrors: DialogFooterLine[] = [
    ...(loadError !== null ? [errorLine(loadError)] : []),
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
      maxHeight={DIALOG_MAX_HEIGHT}
      title={windowTitle}
      rows={listRows}
      footer={listFooter}
      errors={listErrors}
      onClose={onClose}
      search
      searchRight
      centerScroll
      onCtrlA={(_focused) => {
        onAddProvider()
        return true
      }}
      onCtrlE={handleCtrlEItem}
    />
  )
}