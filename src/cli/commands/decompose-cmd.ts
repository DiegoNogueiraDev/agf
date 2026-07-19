/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { detectLargeTasks } from '../../core/planner/decompose.js'
import { createHtnPlanner, type HtnOperator } from '../../core/planner/htn-planner.js'
import { InternalPhaseSchema } from '../../core/lifecycle/phase.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'decompose-cmd.ts' })

/** One primitive operator per internal lifecycle phase, chained ANALYZE → ... → LISTENING. */
function buildLifecycleOperators(): HtnOperator[] {
  const phases = InternalPhaseSchema.options.map((p) => p.toLowerCase())
  const primitives: HtnOperator[] = phases.map((phase, i) => ({
    name: phase,
    preconditions: i === 0 ? [] : [`done:${phases[i - 1]}`],
    effects: [`done:${phase}`],
    subtasks: null,
  }))
  const lifecycle: HtnOperator = {
    name: 'lifecycle',
    preconditions: [],
    effects: [`done:${phases[phases.length - 1]}`],
    subtasks: phases,
  }
  return [...primitives, lifecycle]
}

/** Builds the `agf decompose` CLI command (Commander definition). */
export function decomposeCommand(): Command {
  log.info('decompose command registered')
  return new Command('decompose')
    .description('Detecta tasks grandes demais e sugere subtasks atômicas (anti-one-shot)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--plan', 'Planeja um goal via HTN (preconditions/effects) sem tocar o grafo', false)
    .option('--goal <name>', 'Goal a planejar com --plan', 'lifecycle')
    .action((opts: { dir: string; plan: boolean; goal: string }) => {
      const out = createCliOutput('decompose')

      if (opts.plan) {
        const planner = createHtnPlanner(buildLifecycleOperators())
        const result = planner.plan(opts.goal, new Set<string>())
        out.ok({ goal: opts.goal, feasible: result.feasible, steps: result.steps })
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const doc = store.toGraphDocument()
        const results = detectLargeTasks(doc)
        out.ok({
          candidates: results.map((r) => ({
            nodeId: r.node.id,
            title: r.node.title,
            reasons: r.reasons,
            suggestedSubtasks: r.suggestedSubtasks.map((s) => ({
              title: s.title,
              estimateMinutes: s.estimateMinutes,
            })),
          })),
        })
      } finally {
        store.close()
      }
    })
}
