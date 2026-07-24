/*!
 * Detects container epics whose children are all done but the container itself is still backlog.
 *
 * WHY: When all child tasks complete, the parent epic stays in backlog unless explicitly promoted.
 * This creates phantom "blocked" state and inflates in-progress/backlog counts.
 * Report with a promote-or-close applyVia so the human or conductor decides — never auto-delete.
 *
 * Composes with: gap-types.ts (Gap/GapKind), index.ts (GAP_DETECTORS registry).
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'

export function detectStaleContainer(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []

  for (const node of doc.nodes) {
    if (node.type !== 'epic' || node.status === 'done') continue

    const children = doc.nodes.filter((n) => n.parentId === node.id)
    if (children.length === 0) continue

    const allDone = children.every((n) => n.status === 'done' || n.status === 'satisfied')
    if (!allDone) continue

    gaps.push({
      kind: 'stale_container',
      severity: 'recommended',
      nodeId: node.id,
      evidence: `Epic "${node.title}" (${node.id}) has ${children.length} child(ren) all done but is still ${node.status}.`,
      enrichment: {
        action: 'annotate',
        instruction: 'All children are done — promote this container to done or close it.',
        applyVia: [`agf node status ${node.id} done`],
      },
    })
  }

  return gaps
}
