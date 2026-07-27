/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { runBuildOrchestration } from '../shared/run-build.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { createCliOutput } from '../shared/cli-output.js'

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

const log = createLogger({ layer: 'cli', source: 'build-cmd.ts' })

/** Builds the `agf build` CLI command (Commander definition). */
export function buildCommand(): Command {
  log.info('build command registered')
  return new Command('build')
    .description('Orquestra a entrega: PRD → grafo → decompõe → autopilot → entrega (máquina de estados)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--prd <file>', 'Caminho do PRD a importar (default: PRD.md)')
    .option('--max <n>', 'Teto de passos do orquestrador (cost-runaway)', '20')
    .option('--live', 'Implementa com o modelo real (autopilot --live)', false)
    .option('--test-cmd <cmd>', 'Comando de teste no --live', 'npm test')
    .action(async (opts: { dir: string; prd?: string; max: string; live: boolean; testCmd: string }) => {
      const out = createCliOutput('build')
      const store = openStoreOrFail(opts.dir)
      const ledger = new TokenLedger()
      try {
        const maxSteps = Math.max(1, parseInt(opts.max, 10) || 20)
        progress(`[build] orquestrando (max ${maxSteps} passos${opts.live ? ', --live' : ''})…\n`)
        const report = await runBuildOrchestration(store, {
          dir: opts.dir,
          prd: opts.prd,
          maxSteps,
          live: opts.live,
          testCmd: opts.testCmd,
          ledger,
          onLog: progress,
        })
        const t = ledger.totals()
        persistLedger(store.getDb(), ledger, { sessionId: 'build', provider: 'copilot' })

        if (report.stopped === 'escalation') {
          out.fail('ESCALATION', `Build stopped at escalation after ${report.steps} steps`, {
            steps: report.steps,
            stopped: report.stopped,
            tokensTotal: t.total,
          })
        } else {
          out.ok({
            steps: report.steps,
            stopped: report.stopped,
            tokensTotal: t.total,
          })
        }
      } catch (err) {
        out.err('BUILD_FAILED', err instanceof Error ? err.message : String(err))
      } finally {
        store.close()
      }
    })
}
