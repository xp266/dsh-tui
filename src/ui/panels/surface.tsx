import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { mergeRuns } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { CHROME_MARGIN_X, CHROME_PAD_X, CHROME_TEXT_X } from '../../core/metrics.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'
import { CapText } from '../chrome/caps.tsx'

export interface PanelPointerHandle {
  clickAt(y: number, x: number): void
  wheel(dir: -1 | 1): boolean
}

export interface PanelRow {
  segments: Segment[]
  /** Replaces the text row with an interactive node (e.g. a button row). */
  content?: ReactNode
}

export interface PanelHint {
  /** Key token, rendered with the key color (e.g. "enter", an arrow glyph). */
  key: string
  /** Action word, rendered with the description color. */
  description: string
}

export interface PanelLegendOptions {
  /** Leading counter text (e.g. "1/2"), rendered with the description color. */
  prefix?: string
  keyColor?: string
  descriptionColor?: string
}

/**
 * Build a key-hint row: keys in the panel key color, action words in the
 * muted description color ("enter select  esc close").
 */
export function panelLegend(hints: readonly PanelHint[], options: PanelLegendOptions = {}): Segment[] {
  const keyStyle = { color: options.keyColor ?? COLORS.panelKeyText }
  const descriptionStyle = { color: options.descriptionColor ?? COLORS.toolBodyText }
  const parts: Array<Segment> = []
  if (options.prefix !== undefined && options.prefix !== '') {
    parts.push({ text: options.prefix, style: descriptionStyle })
  }
  for (const [index, hint] of hints.entries()) {
    if (index > 0 || parts.length > 0) parts.push({ text: '  ', style: descriptionStyle })
    parts.push({ text: hint.key, style: keyStyle })
    parts.push({ text: ' ', style: descriptionStyle })
    parts.push({ text: hint.description, style: descriptionStyle })
  }
  return mergeRuns(parts)
}

/**
 * Shared panel chrome: a floating block anchored above the status line with
 * half-block caps, the panel background, and per-row text or interactive
 * content. Builtin panels and plugin panels built through dshtui/dialog
 * share this shell so every interaction panel looks the same.
 *
 * Selection pieces span the row text only, never the pill padding, so
 * dragging over blank panel area selects nothing (same rule as messages).
 */
export function PanelSurface({ columns, rows, body, bodyStart, background, blockWidth }: {
  columns: number
  rows: number
  body: PanelRow[]
  bodyStart: number
  background: string
  blockWidth: number
}) {
  return (
    <Region>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={bodyStart - 1} left={CHROME_MARGIN_X} width={blockWidth}>
          <CapText background={background} top width={blockWidth} />
        </Box>
        {body.map((row, index) => {
          const isEmpty = row.segments.every(segment => segment.text.trim() === '')
          return (
            <Box
              key={`panel-row-${index}`}
              position="absolute"
              top={bodyStart + index}
              left={CHROME_MARGIN_X}
              width={blockWidth}
              paddingLeft={CHROME_PAD_X}
              paddingRight={CHROME_PAD_X}
              backgroundColor={background}
            >
              {row.content !== undefined
                ? row.content
                : isEmpty
                  ? <Text>{' '}</Text>
                  : <SelectableText y={bodyStart + index} col={CHROME_TEXT_X} segments={row.segments} />}
            </Box>
          )
        })}
        <Box position="absolute" top={bodyStart + body.length} left={CHROME_MARGIN_X} width={blockWidth}>
          <CapText background={background} top={false} width={blockWidth} />
        </Box>
      </Box>
    </Region>
  )
}
