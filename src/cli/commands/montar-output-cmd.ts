/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreIfExists } from '../open-store.js'
import { decideScaffold } from '../../core/rag-out/gate.js'
import { loadDefaultScaffoldCorpus } from '../../core/rag-out/scaffold-corpus.js'
import { detectProjectLanguage } from '../../core/rag-out/language.js'
import {
  estimateRagOutEconomy,
  toLeverEvent,
  scaffoldCostBreakdown,
  toLeverEventFromBreakdown,
  formatScaffoldRecoveryMessage,
  type ScaffoldCostBreakdown,
} from '../../core/rag-out/economy.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'

const log = createLogger({ layer: 'cli', source: 'montar-output-cmd.ts' })

/** Structure vs slot cost model (PRD 2.3 estimate) — independent of whether a project store exists. */
function computeBreakdown(economy: ReturnType<typeof estimateRagOutEconomy>, slotCount: number): ScaffoldCostBreakdown {
  const structureTokens = economy.decision === 'recover' ? economy.baselineTokens - economy.actualTokens : 0
  const slotTokens = slotCount * 12 // 12 tokens per slot (PRD 2.3 estimate)
  return scaffoldCostBreakdown({ structureTokens, slotTokens })
}

/** Record the RAG-OUT economy lever when a project store is available (best-effort). */
function recordEconomy(
  dir: string,
  economy: ReturnType<typeof estimateRagOutEconomy>,
  breakdown: ScaffoldCostBreakdown,
): void {
  // Best-effort: openStoreIfExists returns undefined (never exits) when there is
  // no project at `dir`, so telemetry never kills the command.
  const store = openStoreIfExists(dir)
  if (!store) return
  try {
    const sessionId = process.env.AGF_SESSION_ID ?? 'cli'
    const db = store.getDb()
    recordLeverEvent(db, toLeverEvent(economy, sessionId))
    // Also record the cost-model breakdown (structure vs slot tokens) for accurate savings
    recordLeverEvent(db, toLeverEventFromBreakdown(breakdown, sessionId))
  } catch {
    /* telemetry is best-effort */
  } finally {
    store.close()
  }
}

/**
 * RAG-OUT: decide whether to recover a scaffold (and fill only its slots) or
 * generate from scratch for a genuinely new goal. Below the bar (global
 * threshold AND the scaffold's novelty_floor) it returns `generate` — recovering
 * a wrong scaffold is worse than generating.
 */
export function montarOutputCommand(): Command {
  log.info('montar-output command registered')
  return new Command('montar-output')
    .description('RAG-OUT: recupera o scaffold adequado (preenche slots) ou gera, por objetivo')
    .argument('<goal>', 'Objetivo do output em linguagem natural')
    .option('--threshold <n>', 'Limiar global de confiança [0,1]', '0.5')
    .option('--limit <n>', 'Máximo de candidatos retornados', '3')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((goal: string, opts: { threshold: string; limit: string; dir: string }) => {
      const out = createCliOutput('montar-output')
      const corpus = loadDefaultScaffoldCorpus()
      const projectLanguage = detectProjectLanguage(opts.dir)
      const decision = decideScaffold(goal, corpus, {
        threshold: Number(opts.threshold),
        k: Number(opts.limit),
        projectLanguage,
      })
      const economy = estimateRagOutEconomy(decision)
      const slotCount = decision.best?.slots.length ?? 0
      const breakdown = computeBreakdown(economy, slotCount)
      recordEconomy(opts.dir, economy, breakdown)
      const message = formatScaffoldRecoveryMessage(decision.decision, Math.round(breakdown.saved))
      out.ok(
        {
          decision: decision.decision,
          confidence: decision.confidence,
          reason: decision.reason,
          projectLanguage,
          scaffold: decision.best ? { id: decision.best.id, structureRef: decision.best.structureRef ?? null } : null,
          slots: decision.decision === 'recover' ? (decision.best?.slots ?? []) : [],
          candidates: decision.candidates.map((c) => ({ id: c.scaffold.id, score: c.score })),
          economy: {
            lever: economy.lever,
            saved: economy.saved,
            baselineTokens: economy.baselineTokens,
            baselineMethod: economy.baselineMethod,
          },
          ...(message ? { message } : {}),
          corpusSize: corpus.length,
        },
        { count: decision.candidates.length },
      )
    })
}
