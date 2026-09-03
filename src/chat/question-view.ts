import type { AskOptionLike, AskQuestionItemLike, AskUserQuestionAnswerItemLike } from './interactions.ts'

export const ASK_USER_TOOL_NAME = 'ask_user_question'

const ANSWER_INDENT = 3
const UNANSWERED_TEXT = '(Question not answered)'

export function answerSummary(
  question: AskQuestionItemLike,
  selected: readonly string[],
  custom: string,
  customChecked: boolean,
): string {
  if (customChecked && custom !== '') {
    return question.multiSelect === true && selected.length > 0
      ? [...selected, custom].join(', ')
      : custom
  }
  return selected.length === 0 ? UNANSWERED_TEXT : selected.join(', ')
}

export function parseAskQuestions(raw: unknown): AskQuestionItemLike[] {
  if (typeof raw !== 'object' || raw === null) return []
  const questions = (raw as { questions?: unknown }).questions
  if (!Array.isArray(questions)) return []
  return questions.map(questionFromJson).filter(question => question !== undefined)
}

export function parseAskAnswers(resultText: string): AskUserQuestionAnswerItemLike[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(resultText)
  } catch {
    // A non-JSON result text simply carries no answers.
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const answers = (parsed as { answers?: unknown }).answers
  if (!Array.isArray(answers)) return []
  return answers.map(answerFromJson).filter(answer => answer !== undefined)
}

function answerTextOf(question: AskQuestionItemLike, answer: AskUserQuestionAnswerItemLike | undefined): string {
  if (answer === undefined) return UNANSWERED_TEXT
  const custom = answer.custom?.trim() ?? ''
  return answerSummary(question, answer.selected, custom, custom !== '')
}

function questionFromJson(value: unknown): AskQuestionItemLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.question !== 'string') return undefined
  const multiSelect = record.multiSelect === true || record.multi_select === true
  return {
    id: record.id,
    question: record.question,
    ...(typeof record.header === 'string' && record.header !== '' ? { header: record.header } : {}),
    ...(typeof record.detail === 'string' && record.detail !== '' ? { detail: record.detail } : {}),
    ...(Array.isArray(record.options) ? { options: record.options.map(optionFromJson).filter(option => option !== undefined) } : {}),
    ...(multiSelect ? { multiSelect } : {}),
  }
}

function optionFromJson(value: unknown): AskOptionLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.label !== 'string') return undefined
  return { label: record.label }
}

function answerFromJson(value: unknown): AskUserQuestionAnswerItemLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !Array.isArray(record.selected)) return undefined
  const selected = record.selected.filter(label => typeof label === 'string')
  return {
    id: record.id,
    selected,
    ...(typeof record.custom === 'string' ? { custom: record.custom } : {}),
  }
}

/** The ask questions rendered as numbered entries with their options, used
 *  as the card args area (the original question formatting without the
 *  tool-name title line). */
export function formatAskQuestions(raw: unknown): string {
  const questions = parseAskQuestions(raw)
  if (questions.length === 0) return ''
  return questions.map((question, index) => {
    const lines = [`${index + 1}. ${question.question}`]
    if (question.detail !== undefined && question.detail !== '') lines.push(`${' '.repeat(ANSWER_INDENT)}${question.detail}`)
    for (const option of question.options ?? []) lines.push(`${' '.repeat(ANSWER_INDENT)}${option.label}`)
    return lines.join('\n')
  }).join('\n')
}

/** The settled ask card: each question followed by the user's choice. */
export function formatAskAnswered(
  questions: readonly AskQuestionItemLike[],
  answers: readonly AskUserQuestionAnswerItemLike[],
): string {
  return questions.map((question, index) => {
    const answer = answers.find(entry => entry.id === question.id)
    return `${index + 1}. ${question.question}\n${' '.repeat(ANSWER_INDENT)}${answerTextOf(question, answer)}`
  }).join('\n')
}
