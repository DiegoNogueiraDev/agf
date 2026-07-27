/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { calculateForecast } from '../../core/insights/forecast.js'
import { computeCapacityHealth } from '../../core/analyzer/capacity-health.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'forecast-cmd.ts' })

/** Builds the `agf forecast` CLI command (Commander definition). */
export function forecastCommand(): Command {
  log.info('forecast command registered')
  const cmd = new Command('forecast')
    .description('Previsão de ETA do backlog com 95% CI (velocity trend + regressão linear)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('forecast')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const f = calculateForecast(store)
        out.ok(f)
      } finally {
        store.close()
      }
    })

  cmd
    .command('capacity')
    .description('Calibração de capacidade do sprint atual vs velocity histórica (±10% tolerância)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-s, --sprint <label>', 'Sprint label (default: sprint ativo mais recente)')
    .action((opts: { dir: string; sprint?: string }) => {
      const out = createCliOutput('forecast-capacity')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const report = computeCapacityHealth(store.toGraphDocument(), opts.sprint)
        out.ok(report)
      } finally {
        store.close()
      }
    })

  return cmd
}
