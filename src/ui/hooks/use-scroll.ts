import { useCallback, useLayoutEffect, useReducer, useRef } from 'react'
import type { Message } from '../../model/message.ts'

export interface ScrollState {
  scrollTop: number
  applyScroll(next: number): void
}

export function useScroll(total: number, messageHeight: number, messages: Message[]): ScrollState {
  const maxScroll = Math.max(0, total - messageHeight)
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const scrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const maxScrollRef = useRef(maxScroll)
  maxScrollRef.current = maxScroll

  const commit = useCallback((next: number, rerender: boolean): void => {
    const clamped = Math.max(0, Math.min(maxScrollRef.current, next))
    scrollTopRef.current = clamped
    stickToBottomRef.current = clamped >= maxScrollRef.current
    if (rerender) bump()
  }, [bump])

  const applyScroll = useCallback((next: number): void => {
    commit(next === Infinity ? maxScrollRef.current : next, true)
  }, [commit])

  useLayoutEffect(() => {
    if (stickToBottomRef.current) {
      applyScroll(Infinity)
    } else if (scrollTopRef.current > maxScroll) {
      applyScroll(maxScroll)
    }
  }, [maxScroll])

  useLayoutEffect(() => {
    if (stickToBottomRef.current) applyScroll(Infinity)
  }, [messages])

  return { scrollTop: scrollTopRef.current, applyScroll }
}
