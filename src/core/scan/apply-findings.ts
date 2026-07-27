/*!
 * apply-findings — promote scan findings into graph bug/risk nodes.
 *
 * WHY: agf scan produces findings but they vanish after the session; wiring
 * them into the graph as bug/risk nodes closes the detect→file→fix loop.
 * Idempotent by file:line dedup key — re-running scan never creates duplicates.
 *
 * Composes with: scan-cmd.ts (source of findings), node-mutations (insertNode).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import { generateId } from '../utils/id.js'
import type { ScanFinding } from './scan-types.js'

/** A graph node created from a scan finding. */
export type FindingNode = Pick<
  GraphNode,
  'id' | 'type' | 'title' | 'description' | 'acceptanceCriteria' | 'status' | 'priority' | 'createdAt' | 'updatedAt'
>

export interface ApplyFindingsResult {
  /** Number of new nodes created. */
  created: number
  /** Number of findings skipped (already filed). */
  skipped: number
  /** The nodes created in this run. */
  nodes: FindingNode[]
}

/** Dedup key: source + file + line — same location across runs → skip. */
function findingKey(f: ScanFinding): string {
  return `${f.source}::${f.file}::${f.line}`
}

/**
 * Promote each finding into a bug/risk node. Idempotent: existing nodes with
 * the same dedup key (stored in metadata.findingKey) are not duplicated.
 */
export function applyFindings(store: SqliteStore, findings: ScanFinding[]): ApplyFindingsResult {
  // Load existing finding keys from the graph to deduplicate
  const doc = store.toGraphDocument()
  const existingKeys = new Set<string>()
  for (const node of doc.nodes) {
    const key = node.metadata?.findingKey
    if (typeof key === 'string') existingKeys.add(key)
  }

  const created: FindingNode[] = []
  let skipped = 0

  for (const finding of findings) {
    const key = findingKey(finding)
    if (existingKeys.has(key)) {
      skipped++
      continue
    }

    const ts = new Date().toISOString()
    // NodeType has no 'bug'; use 'task' for errors, 'risk' for warnings/info
    const nodeType = finding.severity === 'error' ? 'task' : 'risk'
    const node: GraphNode = {
      id: generateId('node'),
      type: nodeType,
      title: `[${finding.source}] ${finding.file}:${finding.line} — ${finding.message.slice(0, 80)}`,
      description: `Source: ${finding.source}\nFile: ${finding.file}\nLine: ${finding.line}\nSeverity: ${finding.severity}\n\n${finding.message}`,
      status: 'backlog',
      priority: finding.severity === 'error' ? 2 : 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [
        `Given the issue at ${finding.file}:${finding.line}, When fixed, Then ${finding.source} reports no finding for this location.`,
      ],
      tags: [finding.source, finding.severity],
      createdAt: ts,
      updatedAt: ts,
      metadata: {
        source: 'scan',
        findingKey: key,
        origin: finding.source,
      },
    }

    store.insertNode(node)
    existingKeys.add(key)
    created.push({
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
      acceptanceCriteria: node.acceptanceCriteria,
      status: node.status,
      priority: node.priority,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    })
  }

  return { created: created.length, skipped, nodes: created }
}
