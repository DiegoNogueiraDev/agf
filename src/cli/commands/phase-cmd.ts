/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { CANONICAL_PHASES, CANONICAL_TO_INTERNAL, detectPhase } from '../../core/lifecycle/phase.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'phase-cmd.ts' })

/** Builds the `agf phase` CLI command (Commander definition). */
export function phaseCommand(): Command {
  log.info('phase command registered')
  return new Command('phase')
    .description('Mostra a taxonomia de fases (3 canônicas ← 9 internas) e detecta a fase atual do grafo')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('phase')

      const phases = CANONICAL_PHASES.map((phase) => ({
        phase,
        internal: CANONICAL_TO_INTERNAL[phase],
      }))

      const dbPath = join(opts.dir, 'workflow-graph', 'graph.db')
      if (!existsSync(dbPath)) {
        out.ok({ phases, hasProject: false })
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const stats = store.getStats()
        const current = detectPhase({
          totalNodes: stats.totalNodes,
          backlog: stats.byStatus.backlog ?? 0,
          inProgress: stats.byStatus.in_progress ?? 0,
          done: stats.byStatus.done ?? 0,
        })
        out.ok({ phases, hasProject: true, currentPhase: current })
      } finally {
        store.close()
      }
    })
}
