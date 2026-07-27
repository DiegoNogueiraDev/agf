/*!
 * Traceability suggest — plugs requirement-inferrer + test-file-linker into
 * `agf gaps --kind traceability_break --suggest`.
 * Task node_0ac37802352d.
 *
 * WHY: The two inferrers (T3.1, T3.2) produce proposals in isolation. This
 * orchestrator runs both over all tasks in the doc, collects applyVia commands,
 * and returns a ready flag + de-duped command list for the conducting agent.
 * Pure, deterministic, ~0 token.
 *
 * Composes with: requirement-inferrer.ts, test-file-linker.ts, detect-traceability.ts.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { inferRequirementEdges } from './requirement-inferrer.js'
import { inferTestFileEdges } from './test-file-linker.js'

export interface TraceabilitySuggestResult {
  ready: boolean
  commands: string[]
}

/**
 * Run both inferrers over all tasks in the doc and collect unique applyVia
 * commands. ready:true means no commands were generated (fully traced).
 */
export function suggestTraceabilityFixes(doc: GraphDocument): TraceabilitySuggestResult {
  const seen = new Set<string>()
  const commands: string[] = []

  for (const node of doc.nodes) {
    if (node.type !== 'task') continue

    for (const p of inferRequirementEdges(doc, node.id)) {
      if (!seen.has(p.applyVia)) {
        seen.add(p.applyVia)
        commands.push(p.applyVia)
      }
    }

    for (const p of inferTestFileEdges(doc, node.id)) {
      if (!seen.has(p.applyVia)) {
        seen.add(p.applyVia)
        commands.push(p.applyVia)
      }
    }
  }

  return { ready: commands.length === 0, commands }
}
