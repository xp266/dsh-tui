import { performance } from 'node:perf_hooks'

const TIMELINE_SWEEP_MS = 10_000

/**
 * The development react-reconciler build records one user-timing entry per
 * component render into the global timeline, which Node never evicts by
 * itself, so a long streaming session grows the heap until OOM. The entry
 * sink is read at call time, so neutralising it before the first render
 * keeps the timeline flat regardless of which build is loaded; the periodic
 * sweep drains anything recorded outside this process boundary.
 */
export function startPerformanceGuard(): () => void {
  const measure = performance.measure.bind(performance)
  const mark = performance.mark.bind(performance)
  performance.measure = (() => {}) as unknown as typeof performance.measure
  performance.mark = (() => {}) as unknown as typeof performance.mark
  const timer = setInterval(() => {
    performance.clearMeasures()
    performance.clearMarks()
  }, TIMELINE_SWEEP_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
    performance.measure = measure
    performance.mark = mark
  }
}