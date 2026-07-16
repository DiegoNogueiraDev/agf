/*!
 * wire-dormant-ingest — converts dormant capabilities into WIRE-tasks.
 *
 * WHY: harness --dormant lists what is unreachable; this module closes the loop
 * by injecting a WIRE-task per dormant entry into the backlog so the agent can
 * triage and connect them. Dry-run by default; deduplicates against existing nodes.
 *
 * Pure function (no IO). The CLI command owns store access and writes the nodes.
 * Composes with: dormant-report.ts (source), wire-dormant-cmd.ts (consumer).
 */

import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GraphNode } from '../graph/graph-types.js'

export interface DormantEntry {
  module: string
  reason: 'no-surface'
}

export interface WireIngestInput {
  dormant: DormantEntry[]
  /** Module paths already present in the graph (for dedup). */
  existingModules: Set<string>
  /** Module paths to skip (intentionally dormant / allowlisted). */
  allowlist: string[]
  /**
   * When true (default), only previews — signals committed=false.
   * When false, signals committed=true (caller must write nodes to store).
   */
  dryRun?: boolean
}

export interface WireIngestResult {
  tasks: GraphNode[]
  skipped: number
  /** True when dryRun=false — caller should persist the tasks. */
  committed: boolean
}

/**
 * Build WIRE-task nodes for each dormant capability not already queued or allowlisted.
 * Returns the tasks and a skip count. Never writes to store — caller owns persistence.
 */
export function buildWireTasks(input: WireIngestInput): WireIngestResult {
  const { dormant, existingModules, allowlist, dryRun = true } = input

  const tasks: GraphNode[] = []
  let skipped = 0
  const now = new Date().toISOString()

  for (const entry of dormant) {
    if (allowlist.includes(entry.module) || existingModules.has(entry.module)) {
      skipped++
      continue
    }

    const stem = basename(entry.module, '.ts')
    const node: GraphNode = {
      id: `node_wire_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      type: 'task',
      title: `WIRE: connect dormant capability — ${stem}`,
      status: 'backlog',
      description: `Dormant capability detected (no-surface): ${entry.module}. Wire it to at least one surface (src/cli, src/tui, src/mcp, or src/web) by importing and exposing its functionality. Verify with \`agf harness --dormant\` after wiring.`,
      createdAt: now,
      updatedAt: now,
      priority: 2,
      metadata: { source: 'wire-dormant', dormantModule: entry.module },
    }

    tasks.push(node)
  }

  return { tasks, skipped, committed: !dryRun }
}
