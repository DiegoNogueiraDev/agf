/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf okr` — o cockpit de OKR (node_6334980fc7eb, épico node_fa33f02975c3).
 *
 * A SUPERFÍCIE que o dev opera: uma linha por épico com Objetivo, atingimento
 * do KR e o status derivado (on-track|at-risk|no-data). Fecha o loop que estava
 * aberto — os épicos carregavam KR e ninguém lia o outcome.
 *
 * Thin wire (DIP): colhe os épicos do grafo e as entregas do VelocityScorecard,
 * injeta o relógio e delega ao builder puro `buildOkrReport`. Nenhuma métrica é
 * recalculada aqui — o cockpit consome o que os módulos de insights já medem.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import { buildOkrReport } from '../../core/okr/okr-report.js'
import { collectVelocityScorecard } from '../../core/evals/scorecard.js'

const log = createLogger({ layer: 'cli', source: 'okr-cmd.ts' })

/** Build the `agf okr` CLI command. */
export function okrCommand(): Command {
  log.info('okr command registered')
  return new Command('okr')
    .description('OKR cockpit — one line per epic: objective, KR attainment and derived status')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--at-risk', 'Show only the objectives that need attention (status at-risk)', false)
    .action((opts: { dir: string; atRisk?: boolean }) => {
      const out = createCliOutput('okr')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const rows = buildOkrReport({
          epics: store.toGraphDocument().nodes,
          deliveredTasks: safeDeliveredTasks(store),
          now: Date.now(),
          atRiskOnly: opts.atRisk === true,
        })

        out.ok({
          rows,
          count: rows.length,
          atRisk: rows.filter((r) => r.status === 'at-risk').length,
          noData: rows.filter((r) => r.status === 'no-data').length,
        })
      } finally {
        store.close()
      }
    })
}

/**
 * Entregas da janela. Um scorecard indisponível vira 0 — e 0 entregas faz o
 * status cair em `no-data`, nunca num verde sem lastro.
 */
function safeDeliveredTasks(store: Parameters<typeof collectVelocityScorecard>[0]): number {
  try {
    return collectVelocityScorecard(store).doneTasks
  } catch (err) {
    log.warn(`velocity scorecard unavailable: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  }
}
