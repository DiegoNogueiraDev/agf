/*!
 * cycle-repair-cmd — agf cycle-repair CLI command.
 *
 * WHY: Exposes repairCycles (§EPIC-dynamic-replanning Task 1.2, ADR-0061) —
 * detects dependency cycles and proposes fixes (2-node cycles: high
 * confidence, auto-applicable; larger cycles: medium confidence, human
 * review). detectCycles itself is already wired into multiple readiness
 * gates (deploy/review/design/handoff), but the repair-proposal layer was
 * never surfaced. Report-only by default; --apply removes only the
 * high-confidence (2-node) candidate edges.
 *
 * Composes with: cycle-repair.ts (core, pure — mutation happens here via
 * store.deleteEdge, never inside the pure function).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { repairCycles } from '../../core/planner/cycle-repair.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'cycle-repair-cmd.ts' })

/** Builds the `agf cycle-repair` CLI command (Commander definition). */
export function cycleRepairCommand(): Command {
  log.info('cycle-repair command registered')
  return new Command('cycle-repair')
    .description('Detecta ciclos de dependência e propõe correções (ADR-0061) — report-only por padrão')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--apply', 'Remove de verdade as arestas de alta confiança (ciclos de 2 nós)', false)
    .action((opts: { dir: string; apply: boolean }) => {
      const out = createCliOutput('cycle-repair')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const result = repairCycles(store.toGraphDocument())

        if (!opts.apply || result.autoApplied.length === 0) {
          out.ok(result)
          return
        }

        const appliedEdgeIds: string[] = []
        for (const proposal of result.autoApplied) {
          if (store.deleteEdge(proposal.candidateEdge.id)) {
            appliedEdgeIds.push(proposal.candidateEdge.id)
          }
        }
        out.ok({ ...result, appliedEdgeIds })
      } finally {
        store.close()
      }
    })
}
