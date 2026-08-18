import { HighlightedText } from './selection.tsx'

interface MessageLineProps {
  text: string
  row: number
  colStart: number
  color?: string
}

export function MessageLine({ text, row, colStart, color }: MessageLineProps) {
  return <HighlightedText y={row} col={colStart} text={text} color={color} />
}