import { useCallback, useReducer, useRef } from 'react'

export interface ScrollSnapshot {
  top: number
  maxScroll: number
}

export interface ScrollState {
  scrollTop: number
  getScroll(): ScrollSnapshot
  applyScroll(next: number): void
}

/**
 * The effective scroll offset is derived during render: when pinned to the
 * bottom the offset is simply maxScroll, so incoming messages shift the view
 * without a second render pass (the previous layout-effect bump rendered the
 * whole App twice per streaming frame). Only explicit scroll commands commit
 * and re-render.
 */
export function useScroll(total: number, messageHeight: number): ScrollState {
  const maxScroll = Math.max(0, total - messageHeight)
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const scrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const maxScrollRef = useRef(maxScroll)
  maxScrollRef.current = maxScroll
  if (stickToBottomRef.current) {
    scrollTopRef.current = maxScroll
  } else if (scrollTopRef.current > maxScroll) {
    scrollTopRef.current = maxScroll
    stickToBottomRef.current = scrollTopRef.current >= maxScroll
  }

  const commit = useCallback((next: number, rerender: boolean): void => {
    const clamped = Math.max(0, Math.min(maxScrollRef.current, next))
    scrollTopRef.current = clamped
    stickToBottomRef.current = clamped >= maxScrollRef.current
    if (rerender) bump()
  }, [bump])

  const applyScroll = useCallback((next: number): void => {
    commit(next === Infinity ? maxScrollRef.current : next, true)
  }, [commit])

  const getScroll = useCallback((): ScrollSnapshot => ({ top: scrollTopRef.current, maxScroll: maxScrollRef.current }), [])

  return { scrollTop: scrollTopRef.current, getScroll, applyScroll }
}
