import { Box } from 'ink'
import type { ChatBridge } from '../../chat/bridge.ts'
import type { TokenStats } from '../../chat/bridge.ts'
import type { AgentActivity, AgentPhase } from '../../chat/store.ts'
import type { ActivePanel } from '../../chat/interactions.ts'
import type { RetryStatus } from '../../chat/retry-status.ts'
import { colors } from '../../theme.ts'
import { CHROME_MARGIN_X, CHROME_TEXT_X } from '../../core/metrics.ts'
import { textWidth, truncate } from '../../core/text.ts'
import { SPINNER_FRAMES } from '../message/layout.ts'
import { Region } from '../region.tsx'
import { SelectableText } from '../selection.tsx'

const WORKING_HINT = 'Press esc to interrupt'
const WORKING_ARMED_HINT = 'Press esc again to interrupt'
const CHARS_PER_TOKEN = 4

const WORKING_PHASE_LABEL: Record<AgentPhase, string> = {
  'awaiting-request': 'Awaiting request',
  thinking: 'Thinking',
  working: 'Working',
}

interface StatusBarProps {
  bridge: ChatBridge
  columns: number
  top: number
  busy: boolean
  running: boolean
  todoBadge?: { current: number; total: number }
  activity: AgentActivity
  panel: ActivePanel | null
  retryStatus?: RetryStatus
  escArmed: boolean
  uiTick: number
  streamedChars: number
}

export function StatusBar({
  bridge,
  columns,
  top,
  busy,
  running,
  todoBadge,
  activity,
  panel,
  retryStatus,
  escArmed,
  uiTick,
  streamedChars,
}: StatusBarProps) {
  const badge = running && todoBadge !== undefined ? `[Task ${todoBadge.current}/${todoBadge.total}] ` : ''
  const leftText = busy ? `${badge}${agentStatusLabel(activity, panel, retryStatus)}` : cwdLabel(bridge)
  const hint = busy ? (escArmed ? WORKING_ARMED_HINT : WORKING_HINT) : undefined
  const hintCol = CHROME_TEXT_X + textWidth(leftText) + 2
  const leftWidth = textWidth(leftText) + (hint === undefined ? 0 : 2 + textWidth(hint))
  const avail = columns - CHROME_MARGIN_X * 2 - CHROME_TEXT_X
  const stats = truncate(statsText(bridge.tokenStats(), streamedChars), Math.max(1, avail - leftWidth - 2))
  const rightCol = Math.max(CHROME_TEXT_X + leftWidth, columns - CHROME_MARGIN_X * 2 - textWidth(stats))
  return (
    <Box position="absolute" top={top} left={0} width={columns} height={1}>
      <Region y={top}>
        <Box position="absolute" top={0} left={CHROME_MARGIN_X} width={columns - CHROME_MARGIN_X}>
          {busy && <SpinnerGlyph tick={uiTick} />}
        </Box>
        <Box position="absolute" top={0} left={CHROME_TEXT_X} width={columns - CHROME_TEXT_X}>
          <SelectableText
            y={0}
            col={CHROME_TEXT_X}
            text={leftText}
            color={busy ? colors.workspaceWriteText : colors.cwdText}
          />
        </Box>
        {hint !== undefined && (
          <Box position="absolute" top={0} left={hintCol} width={Math.max(1, columns - hintCol)}>
            <SelectableText y={0} col={hintCol} text={hint} color={colors.dialogHintText} />
          </Box>
        )}
        <Box position="absolute" top={0} left={rightCol} width={Math.max(1, columns - rightCol)}>
          <SelectableText y={0} col={rightCol} text={stats} color={colors.statsText} />
        </Box>
      </Region>
    </Box>
  )
}

function SpinnerGlyph({ tick }: { tick: number }) {
  return (
    <SelectableText
      y={0}
      col={CHROME_MARGIN_X}
      text={`${SPINNER_FRAMES[tick % SPINNER_FRAMES.length]} `}
      color={colors.workspaceWriteText}
    />
  )
}

function agentStatusLabel(activity: AgentActivity, panel: ActivePanel | null, retryStatus?: RetryStatus): string {
  if (panel?.kind === 'approval') return 'Waiting for permission'
  if (panel?.kind === 'question') return 'Waiting for selection'
  if (activity.compacting) return 'Compacting'
  if (retryStatus !== undefined) {
    const remain = retryStatus.untilTs === 0
      ? undefined
      : Math.max(0, Math.ceil((retryStatus.untilTs - Date.now()) / 1000))
    const progress = `(${retryStatus.attempt}/${retryStatus.maxRetries} · ${retryStatus.code})`
    return remain === undefined ? `Retrying… ${progress}` : `Retrying in ${remain}s ${progress}`
  }
  return WORKING_PHASE_LABEL[activity.phase]
}

function cwdLabel(bridge: ChatBridge | undefined): string {
  const home = process.env.HOME ?? ''
  const cwd = bridge?.cwd() ?? process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

function statsText(stats: TokenStats, streamedChars = 0): string {
  const estimate = Math.ceil(streamedChars / CHARS_PER_TOKEN)
  const contextPercent = estimate > 0 && stats.projectedTokens !== undefined && stats.contextWindow !== undefined
    ? Math.min(100, Math.round((stats.projectedTokens + estimate) / stats.contextWindow * 100))
    : stats.contextPercent
  const context = `Context ${contextPercent}%`
  const hit = `Hit ${stats.hitPercent}%`
  const tokens = `${formatTokens(stats.input)} → ${formatTokens(stats.output + estimate)}`
  return `${context} | ${hit} | ${tokens}`
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  const scaled = (v: number): string => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}
