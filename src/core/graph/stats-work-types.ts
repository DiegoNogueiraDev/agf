/*!
 * stats-work-types — separates work nodes (task/subtask/epic) from spec nodes
 * (constraint/risk/requirement/decision/etc.) in the getStats() result.
 *
 * WHY: agf stats showed all backlog counts lumped together, mixing pending work
 * with spec artifacts. backlogWork gives operators the real pending-work count.
 * Additive — existing byStatus/byType fields unchanged (zero blast radius).
 *
 * Composes with: sqlite-store.ts (getStats consumer), stats-cmd.ts (CLI).
 */

/** Node types that represent real implementable work. */
export const WORK_TYPES = new Set(['task', 'subtask', 'epic'])

/** Node types that are spec artifacts, not implementable work items. */
export const SPEC_TYPES = new Set(['constraint', 'risk', 'requirement', 'decision', 'acceptance_criteria', 'milestone'])

export interface WorkStatsSeparation {
  /** Count of backlog task/subtask/epic nodes (pending work). */
  backlogWork: number
  /** Total count of spec-type nodes across all statuses. */
  specNodes: number
}

/**
 * Separate work nodes from spec nodes in a getStats() result.
 * Pure: reads byType/byStatus, returns new counts — no mutation.
 */
export function separateWorkStats(stats: {
  byType: Record<string, number>
  byStatus: Record<string, number>
}): WorkStatsSeparation {
  let specNodes = 0
  for (const [type, count] of Object.entries(stats.byType)) {
    if (SPEC_TYPES.has(type)) specNodes += count
  }

  // backlogWork = total backlog nodes minus spec nodes (approximation without type×status breakdown).
  const totalBacklog = stats.byStatus['backlog'] ?? 0
  const backlogWork = Math.max(0, totalBacklog - specNodes)

  return { backlogWork, specNodes }
}
