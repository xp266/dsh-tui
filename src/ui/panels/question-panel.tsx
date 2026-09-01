import { Box, Text, useInput } from 'ink'
import { panelAnchorRow } from '../layout-service.ts'
import { isKeyConsumed } from '../key-arbiter.ts'
import { useEffect, useState } from 'react'
import { useCaret } from '../hooks/use-caret.ts'
import type { Ref } from 'react'
import { useImperativeHandle } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { CHROME_MARGIN_X, CHROME_TEXT_X } from '../../core/metrics.ts'
import type { AskUserQuestionAnswerLike, QuestionPanelRequest } from '../../chat/interactions.ts'
import {
  buildAnswers,
  cancelEdit,
  commitEdit,
  editorBackspace,
  editorCaret,
  fieldWidthOf,
  editorInsert,
  enterOnRow,
  initialPageState,
  MAX_BODY_ROWS,
  MAX_DETAIL_ROWS,
  moveCursor,
  questionPanelLayout,
  scrollDetail,
  switchPage,
} from './question-model.ts'
import type { QuestionPageState } from './question-model.ts'
import { PanelSurface } from './surface.tsx'
import type { PanelPointerHandle } from './surface.tsx'

export interface QuestionPanelProps {
  handleRef?: Ref<PanelPointerHandle>
  question: QuestionPanelRequest
  background: string
  active: boolean
  columns: number
  innerWidth: number
  blockWidth: number
  rows: number
  onSubmit(answer: AskUserQuestionAnswerLike): void
  onCancel(): void
  onResize(height: number): void
}

export function QuestionPanel({ handleRef, question: panel, background, active, columns, innerWidth, blockWidth, rows, onSubmit, onCancel, onResize }: QuestionPanelProps) {
  const [state, setState] = useState<QuestionPageState>(() => initialPageState(panel.request))
  const { setCursorPosition } = useCaret()
  const layout = questionPanelLayout(state, innerWidth, Math.min(MAX_BODY_ROWS, Math.max(3, rows - 6)))
  const totalHeight = layout.height + 2
  const bodyStart = panelAnchorRow(rows, layout.height)
  useImperativeHandle(handleRef, () => ({
    clickAt(y) {
      if (!active || state.editing) return
      const rel = y - bodyStart
      const hit = layout.hitRows.find(entry => entry.line === rel)
      if (hit === undefined) return
      setState(current => {
        if (current.cursors[current.page] === hit.optionIndex) return enterOnRow(current)
        return {
          ...current,
          cursors: current.cursors.map((value, index) => index === current.page ? hit.optionIndex : value),
        }
      })
    },
    wheel(dir: -1 | 1) {
      if (!active || state.editing) return false
      setState(current => scrollDetail(current, dir === -1 ? -3 : 3))
      return true
    },
  }))
  if (active && state.editing && layout.caret !== null) {
    setCursorPosition({
      x: CHROME_TEXT_X + layout.caret.col,
      y: bodyStart + layout.caret.row,
    })
  } else {
    setCursorPosition(undefined)
  }
  useEffect(() => {
    if (state.editing) {
      writeCursorShape('show')
      writeCursorShape('beam')
    } else {
      writeCursorShape('hide')
    }
  }, [state.editing])
  useEffect(() => {
    return () => {
      writeCursorShape('show')
      writeCursorShape('reset')
    }
  }, [])
  useEffect(() => {
    setState(initialPageState(panel.request))
  }, [panel.id])
  useEffect(() => {
    onResize(totalHeight)
  }, [totalHeight])
  useInput((input, key) => {
    if (!active || isKeyConsumed()) return
    if (isMouseResidue(input)) return
    if (state.editing) {
      if (key.return) {
        setState(current => commitEdit(current))
        return
      }
      if (key.escape) {
        setState(current => cancelEdit(current))
        return
      }
      const fieldWidth = fieldWidthOf(state.request.questions[state.page]!, innerWidth)
      if (key.upArrow) return setState(current => editorCaret(current, 0, -1, fieldWidth))
      if (key.downArrow) return setState(current => editorCaret(current, 0, 1, fieldWidth))
      if (key.leftArrow) return setState(current => editorCaret(current, -1, 0, fieldWidth))
      if (key.rightArrow) return setState(current => editorCaret(current, 1, 0, fieldWidth))
      if (key.home) return setState(current => ({ ...current, editor: { value: current.editor.value, cursor: 0 } }))
      if (key.end) return setState(current => ({ ...current, editor: { value: current.editor.value, cursor: current.editor.value.length } }))
      if (key.backspace || key.delete) return setState(current => editorBackspace(current))
      if (key.ctrl && input === 'j') return setState(current => editorInsert(current, '\n'))
      if (!key.ctrl && !key.meta && input.length > 0) return setState(current => editorInsert(current, input))
      return
    }
    if (key.escape) {
      onCancel()
      return
    }
    if (key.leftArrow) return setState(current => switchPage(current, -1))
    if (key.rightArrow) return setState(current => switchPage(current, 1))
    if (key.pageUp) return setState(current => scrollDetail(current, -MAX_DETAIL_ROWS))
    if (key.pageDown) return setState(current => scrollDetail(current, MAX_DETAIL_ROWS))
    if (key.upArrow) return setState(current => moveCursor(current, -1))
    if (key.downArrow) return setState(current => moveCursor(current, 1))
    const isReview = state.page >= state.request.questions.length
    if (key.return) {
      if (isReview) {
        onSubmit({ answers: buildAnswers(state) })
        return
      }
      setState(current => enterOnRow(current))
    }
  })
  return (
    <PanelSurface
      columns={columns}
      rows={rows}
      body={layout.lines.map(segments => ({ segments }))}
      bodyStart={bodyStart}
      background={background}
      blockWidth={blockWidth}
    />
  )
}
