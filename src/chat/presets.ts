import type { AgentPreset } from '@deepseek-ai/dsh-agent-presets'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const BUILT_IN_NAMES: Readonly<Record<string, string>> = {
  standard: 'Standard mode',
  code: 'Code mode',
  minimal: 'Minimal mode',
  cordis: 'Creator mode',
}

export interface PresetSummary {
  id: string
  name: string
}

export function presetDisplayName(preset: AgentPreset): string {
  return BUILT_IN_NAMES[preset.id] ?? preset.name ?? preset.id
}

export function isBlankSession(events: readonly SessionEvent[]): boolean {
  return !events.some(event => event.type === 'turn/start')
}