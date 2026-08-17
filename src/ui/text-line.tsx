import { Text } from 'ink'
import { createContext, useContext } from 'react'
import type { SelectionRect } from './layout.ts'
import { colToCharIndex, textWidth } from '../utils/text.ts'

export const SelectionContext = createContext<SelectionRect | null>(null)

interface MessageLineProps {
  text: string
  row: number
  colStart: number
  color?: string
}

export function MessageLine({ text, row, colStart, color }: MessageLineProps) {
  const rect = useContext(SelectionContext)
  if (rect === null || row < rect.top || row > rect.bottom) {
    return <Text color={color}>{text}</Text>
  }
  const lineWidth = textWidth(text)
  let before = text
  let selected = ''
  let after = ''
  const left = Math.max(colStart, rect.left)
  const right = Math.min(colStart + lineWidth, rect.right)
  if (left < right) {
    const startIndex = colToCharIndex(text, left - colStart)
    const endIndex = colToCharIndex(text, right - colStart)
    before = text.slice(0, startIndex)
    selected = text.slice(startIndex, endIndex)
    after = text.slice(endIndex)
  }
  return (
    <Text color={color}>
      {before}
      {selected === '' ? null : <Text inverse>{selected}</Text>}
      {after}
    </Text>
  )
}
