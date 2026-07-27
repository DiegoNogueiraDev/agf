/*!
 * agf claims — read-only visibility of active agent lease claims.
 *
 * WHY: agents coordinating on one graph need to see who holds what without
 * hitting the full swarm command. This is a lightweight inspection surface
 * over the resource_locks table.
 *
 * Composes with: LockManager (lock-manager.ts), openStoreOrFail (open-store.ts).
 */

import { Command } from 'commander'
import { taskIdFromResource } from '../../core/planner/task-resource-key.js'
import { openStoreOrFail } from '../open-store.js'
import { listActiveClaims, sweepExpiredClaims, type LockInfo } from '../../core/store/lock-manager.js'
import { declaredFilesOf, claimedByOf } from '../../core/planner/next-task.js'
import type { GraphNode } from '../../core/graph/graph-types.js'
import { createCliOutput } from '../shared/cli-output.js'

// ── Visão da colônia (node_4248646d3d7f) ──────────────────────────────────────

export interface ColonyAntView {
  agentId: string
  taskId: string
  files: string[]
  /** Presente quando há lease VIVA — ausência significa proteção só por status+dono. */
  lease?: { expiresAt: string }
}

export interface ColonyOverlap {
  file: string
  agents: string[]
}

/**
 * Une as DUAS fontes de "formiga em voo" — leases vivas (atomicidade de pull)
 * e nodes in_progress com dono (o feromônio durável) — numa visão por agente,
 * com os overlaps de arquivo par-a-par (o sinal de colisão iminente).
 * Pura: testável sem CLI/store.
 */
export function buildColonyView(
  nodes: readonly GraphNode[],
  claims: readonly LockInfo[],
): { colony: ColonyAntView[]; overlaps: ColonyOverlap[] } {
  const byKey = new Map<string, ColonyAntView>()

  for (const node of nodes) {
    if (node.status !== 'in_progress') continue
    const owner = claimedByOf(node)
    if (!owner) continue
    byKey.set(`${owner}|${node.id}`, { agentId: owner, taskId: node.id, files: declaredFilesOf(node) })
  }

  for (const claim of claims) {
    const taskId = taskIdFromResource(claim.resourceId)
    if (taskId === null) continue
    const key = `${claim.agentId}|${taskId}`
    const node = nodes.find((n) => n.id === taskId)
    const existing = byKey.get(key) ?? {
      agentId: claim.agentId,
      taskId,
      files: node ? declaredFilesOf(node) : [],
    }
    byKey.set(key, { ...existing, lease: { expiresAt: claim.expiresAt } })
  }

  const colony = [...byKey.values()]
  const overlaps: ColonyOverlap[] = []
  const owners = new Map<string, Set<string>>()
  for (const ant of colony) {
    for (const file of ant.files) {
      const set = owners.get(file) ?? new Set<string>()
      set.add(ant.agentId)
      owners.set(file, set)
    }
  }
  for (const [file, agents] of owners) {
    if (agents.size > 1) overlaps.push({ file, agents: [...agents].sort() })
  }

  return { colony, overlaps }
}

/** Builds the `agf claims` CLI command. */
export function claimsCommand(): Command {
  return new Command('claims')
    .description('List active agent lease claims on graph tasks (read-only)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--sweep', 'Sweep expired leases and return count', false)
    .option('--colony', 'Visão da colônia: agentes, tasks in_progress com dono, arquivos em voo e overlaps', false)
    .action((opts: { dir: string; sweep: boolean; colony: boolean }) => {
      const out = createCliOutput('claims')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (opts.sweep) {
          const swept = sweepExpiredClaims(store.getDb())
          out.ok({ swept })
          return
        }
        const claims = listActiveClaims(store.getDb())
        if (opts.colony) {
          const { colony, overlaps } = buildColonyView(store.toGraphDocument().nodes, claims)
          out.ok({ colony, overlaps, count: colony.length })
          return
        }
        out.ok({ claims, count: claims.length })
      } finally {
        store.close()
      }
    })
}
