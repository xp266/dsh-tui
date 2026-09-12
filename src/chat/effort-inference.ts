import { EFFORT_TABLE, MODEL_INDEX, PROVIDER_URLS } from './model-capabilities.ts'
import type { ModelEffortKey } from './models.ts'

export type ReasoningEfforts = Partial<Record<ModelEffortKey, string | null>>

const ENTRY_SEPARATOR = '\u0002'
const FIELD_SEPARATOR = '\u0001'
const KEY_SEPARATOR = '\u0000'

const hosts = new Map<string, string[]>()
for (const entry of PROVIDER_URLS.split(ENTRY_SEPARATOR)) {
  const [url, providerId] = entry.split(FIELD_SEPARATOR)
  try {
    const host = new URL(url).host.toLowerCase()
    const known = hosts.get(host)
    if (known === undefined) hosts.set(host, [providerId])
    else if (!known.includes(providerId)) known.push(providerId)
  } catch {
    // Snapshot rows come from an external database; a malformed URL only drops that provider.
  }
}

const models = new Map(
  MODEL_INDEX.split(ENTRY_SEPARATOR).map(entry => {
    const [providerId, modelId, effortIndex] = entry.split(FIELD_SEPARATOR)
    return [`${providerId}${KEY_SEPARATOR}${modelId}`, EFFORT_TABLE[Number(effortIndex)] as ReasoningEfforts]
  }),
)

function normalizeHost(baseURL: string): string | undefined {
  try {
    return new URL(baseURL).host.toLowerCase()
  } catch {
    // A malformed baseURL simply matches no known effort table.
    return undefined
  }
}

function candidateModelIds(modelId: string): string[] {
  const lowered = modelId.toLowerCase()
  const separator = lowered.lastIndexOf('/')
  if (separator < 0 || separator === lowered.length - 1) return [lowered]
  const stripped = lowered.slice(separator + 1)
  return stripped === lowered ? [lowered] : [lowered, stripped]
}

export function resolveReasoningEfforts(baseURL: string, modelId: string): ReasoningEfforts | undefined {
  const host = normalizeHost(baseURL)
  const providerIds = host === undefined ? undefined : hosts.get(host)
  if (providerIds === undefined) return undefined
  for (const candidate of candidateModelIds(modelId)) {
    for (const providerId of providerIds) {
      const efforts = models.get(`${providerId}${KEY_SEPARATOR}${candidate}`)
      if (efforts !== undefined) return efforts
    }
  }
  return undefined
}
