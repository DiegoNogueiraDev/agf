/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { getCalibrationEvents, getRecentAbEvents, listLevers } from '../../core/economy/economy-lever-ledger.js'
import { calibrateThreshold } from '../../core/rag-in/calibrate.js'
import { welchTTest, formatAbResult } from '../../core/economy/ab-compare.js'
import { loadEconomyConfig, saveEconomyConfig, applyCalibration } from '../../core/economy/economy-config.js'
import { abSplitStratified } from '../../core/algorithms/stats/ab-split-stratified.js'

const log = createLogger({ layer: 'cli', source: 'calibrate-cmd.ts' })

/**
 * RAG threshold calibration (PRD 4.6): read the economy lever ledger and
 * recommend, per lever, the confidence threshold where retrieval actually pays
 * (score × saved). Closes the loop — feed the recommendation back into the gate.
 */
export function calibrateCommand(): Command {
  log.info('calibrate command registered')
  return new Command('calibrate')
    .description('Calibra o limiar do portão RAG por score×saved (lê economy_lever_ledger)')
    .option('--lever <name>', 'Calibra só um lever (ex.: rag_in_reuse, rag_out_recovery)')
    .option('--threshold <n>', 'Limiar default quando não há dados', '0.5')
    .option('--band <n>', 'Largura da faixa de score', '0.2')
    .option('--a <json>', 'Config A para A/B test (JSON)')
    .option('--b <json>', 'Config B para A/B test (JSON)')
    .option('--tasks <n>', 'Número de eventos por grupo no A/B test', '10')
    .option('--apply', 'Aplica as recomendações ao .agf/economy.toml (requer sampleSize >= 10)')
    .option('--seed <n>', 'Semente para o A/B split estratificado (inteiro; default: Date.now())')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (opts: {
        lever?: string
        threshold: string
        band: string
        a?: string
        b?: string
        tasks: string
        apply?: boolean
        seed?: string
        dir: string
      }) => {
        const out = createCliOutput('calibrate')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const db = store.getDb()

          // A/B comparison mode when --a and --b are both provided
          if (opts.a !== undefined && opts.b !== undefined) {
            const lever = opts.lever ?? 'unknown'
            const tasksPerGroup = Math.max(1, Number(opts.tasks))
            let configA: Record<string, unknown>
            let configB: Record<string, unknown>
            try {
              configA = JSON.parse(opts.a) as Record<string, unknown>
              configB = JSON.parse(opts.b) as Record<string, unknown>
            } catch {
              out.err('INVALID_JSON', 'invalid JSON in --a or --b')
              return
            }
            const events = getRecentAbEvents(db, lever, tasksPerGroup * 2)
            const savedValues = events.map((e) => e.saved)
            const seed = (opts.seed !== undefined ? Number(opts.seed) : Date.now()) >>> 0
            const { groupA, groupB } = abSplitStratified(savedValues, { seed })
            const samplesA = groupA
            const samplesB = groupB
            const result = welchTTest(samplesA, samplesB)
            out.ok({
              abTest: {
                lever,
                configA,
                configB,
                nA: samplesA.length,
                nB: samplesB.length,
                avgA: result.avgA,
                avgB: result.avgB,
                delta: result.delta,
                pValue: result.pValue,
                winner: result.winner,
                significant: result.significant,
                label: 'ab-test',
                summary: formatAbResult(result),
              },
            })
            return
          }

          const levers = opts.lever ? [opts.lever] : listLevers(db)
          const calibrations = levers.map((lever) => {
            const events = getCalibrationEvents(db, lever)
            const result = calibrateThreshold(events, {
              defaultThreshold: Number(opts.threshold),
              bandWidth: Number(opts.band),
            })
            return {
              lever,
              recommended: result.recommended,
              reason: result.reason,
              sampleSize: events.length,
              bands: result.bands,
            }
          })

          if (opts.apply) {
            const currentCfg = loadEconomyConfig(opts.dir)
            const applyInputs = calibrations.map((c) => ({
              lever: c.lever,
              recommended: c.recommended,
              sampleSize: c.sampleSize,
            }))
            const { results: applyResults, updatedConfig } = applyCalibration(applyInputs, currentCfg)
            const anyApplied = applyResults.some((r) => r.applied)
            if (anyApplied) saveEconomyConfig(opts.dir, updatedConfig)
            out.ok({ apply: applyResults, calibrations }, { count: applyResults.length })
            return
          }

          out.ok({ calibrations }, { count: calibrations.length })
        } finally {
          store.close()
        }
      },
    )
}
