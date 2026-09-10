/**
 * Which tool cards may fold and which always show in full, resolved from
 * config. Diff and read cards keep their own never-fold rule in layout.ts
 * (their body IS the payload); this policy covers the remaining text bodies
 * by tool name, so builtins and plugin-registered tools follow one path.
 */

export interface CollapsePolicy {
  /** Body lines over this count fold by default (with the char cap). */
  maxLines: number
  /** Tool names that fold by default even under the size thresholds. */
  folded: ReadonlySet<string>
  /** Tool names that never fold, overriding both size and the folded list. */
  expanded: ReadonlySet<string>
}

export const DEFAULT_COLLAPSE_POLICY: CollapsePolicy = {
  maxLines: 8,
  folded: new Set(),
  expanded: new Set(['compact', 'compaction']),
}

let policy = DEFAULT_COLLAPSE_POLICY

export function currentCollapsePolicy(): CollapsePolicy {
  return policy
}

export function setCollapsePolicy(next: { maxLines?: number; folded?: string[]; expanded?: string[] }): void {
  policy = {
    maxLines: typeof next.maxLines === 'number' && next.maxLines > 0 ? Math.floor(next.maxLines) : policy.maxLines,
    folded: next.folded === undefined ? policy.folded : new Set(next.folded.map(name => name.toLowerCase())),
    expanded: next.expanded === undefined ? policy.expanded : new Set(next.expanded.map(name => name.toLowerCase())),
  }
}
