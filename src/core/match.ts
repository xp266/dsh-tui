/**
 * True when `query` appears in `name` as an ordered subsequence: every query
 * character is found left to right with arbitrary gaps. An empty query matches
 * everything. Case handling is the caller's job.
 */
export function isSubsequence(query: string, name: string): boolean {
  if (query === '') return true
  let at = 0
  for (const ch of name) {
    if (ch === query[at]) at += 1
    if (at === query.length) return true
  }
  return false
}
