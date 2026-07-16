export interface CommitEntry {
  type: string
  scope?: string
  description: string
}

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?:\s*(.+)/

/** Parse a conventional commit message (`type(scope): description`) into a CommitEntry. Returns null on non-matching messages. */
export function parseConventionalCommit(message: string): CommitEntry | null {
  const match = message.trim().match(CONVENTIONAL_RE)
  if (!match) return null
  return {
    type: match[1],
    scope: match[2] || undefined,
    description: match[3],
  }
}

const TYPE_GROUP: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  chore: 'Chores',
  docs: 'Documentation',
  refactor: 'Refactoring',
  test: 'Tests',
  perf: 'Performance',
  style: 'Style',
  ci: 'CI',
}

/** Group commit entries by their conventional type (feat→Features, fix→Bug Fixes, etc.). Unknown types fall into "Other". */
export function groupByType(entries: CommitEntry[]): Record<string, CommitEntry[]> {
  const groups: Record<string, CommitEntry[]> = {}
  for (const entry of entries) {
    const group = TYPE_GROUP[entry.type] ?? 'Other'
    if (!groups[group]) groups[group] = []
    groups[group].push(entry)
  }
  return groups
}

/** Render grouped commit entries as a Keep-a-Changelog section heading for `version`. */
export function formatKeepAChangelog(version: string, groups: Record<string, CommitEntry[]>): string {
  const lines: string[] = [`## [${version}]`]
  for (const [group, entries] of Object.entries(groups)) {
    if (entries.length === 0) continue
    lines.push(`\n### ${group}`)
    for (const entry of entries) {
      const scope = entry.scope ? `**${entry.scope}:** ` : ''
      lines.push(`- ${scope}${entry.description}`)
    }
  }
  return lines.join('\n') + '\n'
}
