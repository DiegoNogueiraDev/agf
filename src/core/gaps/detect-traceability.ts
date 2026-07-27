/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M1 — requirement → task → test completeness gaps. Deterministic, ~0 token.
 * A requirement with no implementing task is `required`; an implemented-but-
 * untested task is `recommended` (tests arrive later in the flow — margin for
 * the driver). Reuses {@link buildFullChainTraceability}.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { buildFullChainTraceability } from '../designer/traceability-matrix.js'

export function detectTraceability(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []
  for (const entry of buildFullChainTraceability(doc).entries) {
    if (entry.chain === 'none') {
      gaps.push({
        kind: 'traceability_break',
        severity: 'required',
        nodeId: entry.requirementId,
        evidence: `Requisito ${entry.requirementId} não tem task que o implementa`,
        enrichment: {
          action: 'add_edges',
          instruction: `Crie/ligue uma task que implementa o requisito ${entry.requirementId}`,
          applyVia: [`agf edge add --from <taskId> --to ${entry.requirementId} --type implements`],
        },
      })
    } else if (entry.chain === 'partial') {
      for (const taskId of entry.linkedTasks.filter((t) => !entry.testedTasks.includes(t))) {
        gaps.push({
          kind: 'traceability_break',
          severity: 'recommended',
          nodeId: taskId,
          evidence: `Task ${taskId} (implementa ${entry.requirementId}) não tem evidência de teste (edge 'tests')`,
          enrichment: {
            action: 'add_edges',
            instruction: `Adicione um nó de teste e ligue-o à task ${taskId} via 'tests'`,
            applyVia: [
              `agf node add --type browser_test --title "Teste de ${taskId}"`,
              `agf edge add --from <testId> --to ${taskId} --type tests`,
            ],
          },
        })
      }
    }
  }
  return gaps
}
