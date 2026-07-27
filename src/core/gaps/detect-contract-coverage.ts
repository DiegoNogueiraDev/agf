/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Gap detector: contract_coverage (node_05cf12fa1679).
 *
 * WHY (Design by Contract — Meyer 1992): a boundary task (a new route/api/endpoint,
 * a CLI command, a hook, a WIRE) whose title flags a public surface but which has
 * NO `implements`/`consumes` edge to a `contract` node is exactly the backlog that
 * makes the executor invent the shape (signature, envelope, error codes). Surfacing
 * it as a RECOMMENDED gap lets the planner define the contract BEFORE the junior
 * guesses it. Pure, deterministic, ~0 token, report-only (recommended never blocks).
 *
 * Composes with: gaps/index.ts (registry), the gap `applyVia` protocol.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'

/** Whole-word boundary keywords (case-insensitive) — plus the `WIRE:` task prefix. */
const BOUNDARY_PATTERN = /\b(rota|route|api|endpoint|comando|command|hook)\b|wire:/i

/** True when a title/description signals a public boundary surface. */
function isBoundaryTask(node: GraphNode): boolean {
  return BOUNDARY_PATTERN.test(`${node.title ?? ''} ${node.description ?? ''}`)
}

/**
 * A boundary backlog task with no implements/consumes edge to a `contract` node
 * gets a recommended gap. The edge must TARGET a contract node — an edge to any
 * other node type does not define the boundary's shape and does not satisfy it.
 */
export function detectContractCoverage(doc: GraphDocument): Gap[] {
  const contractIds = new Set(doc.nodes.filter((n) => n.type === 'contract').map((n) => n.id))
  const gaps: Gap[] = []

  for (const node of doc.nodes) {
    if (node.type !== 'task' && node.type !== 'subtask') continue
    if (node.status !== 'backlog') continue
    if (!isBoundaryTask(node)) continue

    const hasContractEdge = doc.edges.some(
      (e) =>
        e.from === node.id &&
        (e.relationType === 'implements' || e.relationType === 'consumes') &&
        contractIds.has(e.to),
    )
    if (hasContractEdge) continue

    const epicRef = node.parentId ?? '<epic>'
    gaps.push({
      kind: 'contract_coverage',
      severity: 'recommended',
      nodeId: node.id,
      evidence: `Task de boundary "${node.title}" (${node.id}) sem edge implements/consumes para um node contract — o executor terá que inventar o shape (assinatura/envelope/erros).`,
      enrichment: {
        action: 'add_nodes',
        instruction:
          'Defina o contrato do boundary ANTES de implementar: crie um node contract (assinatura/envelope/códigos de erro) e ligue a task a ele com uma edge implements, para o executor não inventar o shape.',
        applyVia: [
          `agf node add --type contract --parent ${epicRef} --title "<contrato do boundary>"`,
          `agf edge add ${node.id} <contractId> --type implements`,
        ],
      },
    })
  }

  return gaps
}
