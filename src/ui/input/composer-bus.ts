import type { ComposerInsertSpec } from '../../contract/index.ts'

type ComposerInserter = (spec: ComposerInsertSpec) => boolean

let inserter: ComposerInserter | undefined

export function setComposerInserter(next: ComposerInserter | undefined): void {
  inserter = next
}

export function insertIntoComposer(spec: ComposerInsertSpec): boolean {
  if (inserter === undefined) return false
  return inserter(spec)
}
