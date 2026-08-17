import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  addDeepSeekKey,
  fetchCustomModels,
  listConfiguredModels,
  saveCustomProvider,
  selectModel,
} from './models.ts'
import type { ConfiguredModel, CustomProviderForm } from './models.ts'

export interface ChatBridge {
  modelName(): string
  send(text: string): void
  subscribe(handler: (event: SessionEvent) => void): () => void
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
}

interface ResolvedModel {
  provider?: string
  model?: string
  display: string
}

export async function createChatBridge(ctx: Context): Promise<ChatBridge> {
  const model = await resolveModel(ctx)
  const agent = ctx.agentLoop.create(
    SessionId(`tui-${Date.now()}`),
    model.provider === undefined ? {} : { provider: model.provider, model: model.model },
    { cwd: process.cwd() },
  )
  const llm = ctx.llm
  return {
    modelName: () => model.display,
    send(text: string) {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    subscribe(handler: (event: SessionEvent) => void) {
      return ctx.on('session/event', (session, event) => {
        if (session.id !== agent.id) return
        handler(event)
      })
    },
    listModels: () => listConfiguredModels(llm),
    selectModel: (provider, name) => selectModel(ctx.agentDefaultModel, provider, name),
    addDeepSeekKey: key => addDeepSeekKey(ctx.credentials, key),
    fetchCustomModels: form => fetchCustomModels(llm, form),
    saveCustomProvider: (form, models) => saveCustomProvider(ctx.settings, ctx.credentials, form, models),
  }
}

async function resolveModel(ctx: Context): Promise<ResolvedModel> {
  const llm = ctx.get('llm')
  if (llm) {
    const glm = await findGlmModel(llm)
    if (glm !== undefined) return glm
  }
  const selection = ctx.get('agentDefaultModel')?.currentSelection()
  if (selection) return { provider: selection.provider, model: selection.model, display: selection.model }
  return { display: 'glm 4.7' }
}

async function findGlmModel(llm: LlmRuntime): Promise<ResolvedModel | undefined> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      for (const provider of llm.listProviders()) {
        const models = await llm.listModels(provider.id)
        const hit = models.find(m => /glm/i.test(m.id))
        if (hit !== undefined) return { provider: provider.id, model: hit.id, display: hit.id }
      }
    } catch {
      // provider registry still settling from the settings document; retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return undefined
}