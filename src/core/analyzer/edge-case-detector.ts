/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Edge-case / error-path detector (M5). Decomposition typically captures the
 * happy path only. A task whose ACs never mention failure, boundary, or error
 * conditions is incomplete. Deterministic, zero-token. Reuses
 * {@link getNodeAcTexts}.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'

const TASK_TYPES = new Set(['task', 'subtask'])

const EDGE_CASE_SIGNALS =
  /(\binvalid\b|inv[áa]lid|\berror\b|\berro\b|\bempty\b|vazio|\bnull\b|undefined|timeout|tim(?:e|es|ed)\s?out|\blimit\b|limite|\bmax\b|m[áa]ximo|unauthor|n[ãa]o autoriz|denied|negad|\bfail\b|falha|falhar|concurren|concorren|boundary|edge case|exceed|exced|overflow|retr(?:y|ies|ied|ying)|reject|rejeit|missing|ausente|forbidden|proibid)/i

/** True if an AC describes an error/boundary/failure condition. */
export function acHasEdgeCase(ac: string): boolean {
  return EDGE_CASE_SIGNALS.test(ac)
}

/** IDs of tasks that have ≥1 AC but none covering an error/boundary case. */
export function tasksMissingEdgeCases(doc: GraphDocument): string[] {
  const out: string[] = []
  for (const node of doc.nodes) {
    if (!TASK_TYPES.has(node.type)) continue
    const acs = getNodeAcTexts(doc, node.id)
    if (acs.length === 0) continue
    if (!acs.some(acHasEdgeCase)) out.push(node.id)
  }
  return out
}

/** A task touching security/auth/payments is high-stakes (edge-cases required). */
export function isHighStakes(node: GraphNode): boolean {
  if ((node.tags ?? []).includes('security')) return true
  return /secur|\bauth|autentica|autoriza|pagamento|payment|senha|password|crypto|cripto/i.test(node.title)
}
