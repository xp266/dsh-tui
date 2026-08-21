import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Message } from '../../model/message.ts'

export interface ScrollState {
  scrollTop: number
  applyScroll(next: number): void
}

export function useScroll(total: number, messageHeight: number, messages: Message[]): ScrollState {
  const [scrollTop, setScrollTop] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const scrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const maxScrollRef = useRef(0)
  const maxScroll = Math.max(0, total - messageHeight)
  maxScrollRef.current = maxScroll
  const applyScroll = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(maxScrollRef.current, next))
    setScrollTop(clamped)
    scrollTopRef.current = clamped
    const atBottom = clamped >= maxScrollRef.current
    setStickToBottom(atBottom)
    stickToBottomRef.current = atBottom
  }, [])
  useLayoutEffect(() => {
    if (stickToBottomRef.current) {
      applyScroll(Infinity)
    } else {
      setScrollTop(current => Math.min(current, maxScroll))
      scrollTopRef.current = Math.min(scrollTopRef.current, maxScroll)
    }
  }, [maxScroll])
  useLayoutEffect(() => {
    if (stickToBottomRef.current) applyScroll(Infinity)
  }, [messages])
  return { scrollTop, applyScroll }
}