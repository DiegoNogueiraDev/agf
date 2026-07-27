/*!
 * suggest-edge-case — `agf gaps --kind missing_edge_case --suggest <id>`.
 * Task node_5ed1f87f2248.
 *
 * WHY: Gives the conducting agent a concrete stub + exact applyVia command so
 * it can close a missing_edge_case gap in one step without reading source.
 * Pure, deterministic, ~0 token.
 *
 * Composes with: detect-edge-cases.ts (gap detection), edge-case-detector.ts.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { tasksMissingEdgeCases } from '../analyzer/edge-case-detector.js'

export interface SuggestEdgeCaseResult {
  code: 'OK' | 'NO_GAP' | 'NOT_FOUND'
  stubs: string[]
  applyVia: string[]
}

const STUBS = [
  'When <entrada inválida / null>, Then retorna erro 400 com mensagem',
  'When <limite excedido>, Then rejeitado com código 422',
  'When <não autorizado>, Then retorna 401 ou 403',
]

/**
 * Returns stub AC suggestions and exact `agf node` commands for a node that
 * has a missing_edge_case gap. Returns NO_GAP if the node is not flagged.
 */
export function suggestEdgeCaseStubs(doc: GraphDocument, nodeId: string): SuggestEdgeCaseResult {
  const nodeExists = doc.nodes.some((n) => n.id === nodeId)
  if (!nodeExists) return { code: 'NOT_FOUND', stubs: [], applyVia: [] }

  const flagged = tasksMissingEdgeCases(doc)
  if (!flagged.includes(nodeId)) {
    return { code: 'NO_GAP', stubs: [], applyVia: [] }
  }

  const applyVia = STUBS.map((stub) => `agf node update ${nodeId} --ac "${stub}"`)
  return { code: 'OK', stubs: STUBS, applyVia }
}
