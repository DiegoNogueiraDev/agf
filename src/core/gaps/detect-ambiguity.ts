/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M6 — ambiguous (UNSPECIFIED) AC gaps. An AC with weasel terms and no concrete
 * criterion can't be implemented unambiguously. `recommended` (the driver makes
 * it measurable or records a decision). Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { classifyAmbiguity } from '../analyzer/ambiguity-gate.js'

const AC_BEARING_TYPES = new Set(['task', 'subtask', 'requirement'])

function short(text: string): string {
  const t = text.trim()
  return t.length > 80 ? `${t.slice(0, 77)}…` : t
}

export function detectAmbiguity(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []
  for (const node of doc.nodes) {
    if (!AC_BEARING_TYPES.has(node.type)) continue
    for (const ac of getNodeAcTexts(doc, node.id)) {
      const result = classifyAmbiguity(ac)
      if (result.level !== 'unspecified') continue
      const label = short(ac)
      const terms = result.vagueTerms.join(', ')
      gaps.push({
        kind: 'ambiguous_ac',
        severity: 'recommended',
        nodeId: node.id,
        evidence: `AC ambígua em ${node.id}: termo(s) vago(s) [${terms}] sem critério concreto — "${label}"`,
        enrichment: {
          action: 'clarify',
          instruction: `Especifique a AC "${label}" — troque [${terms}] por um critério mensurável, ou registre uma decision que fixe a interpretação`,
          options: [
            'Tornar mensurável (ex.: "< 200ms", "≥ 95%", "status 200")',
            'Registrar uma decision que define a interpretação aceita',
          ],
          applyVia: [
            `agf node update ${node.id} --ac "<critério mensurável>"`,
            `agf node add --type decision --title "Interpretação de '${result.vagueTerms[0]}' em ${node.id}"`,
          ],
        },
      })
    }
  }
  return gaps
}
