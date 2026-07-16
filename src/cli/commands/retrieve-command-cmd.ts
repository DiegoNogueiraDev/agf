/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { execFileSync } from 'node:child_process'
import { resolveSessionId } from '../../core/session/session-id.js'
import { currentTaskId } from '../../core/economy/attribution.js'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreIfExists } from '../open-store.js'
import { retrieveCommand as retrieve } from '../../core/rag-in/retrieve.js'
import { buildLiveCorpus } from '../../core/rag-in/builtin-corpus.js'
import { CLI_COMMANDS } from '../index.js'
import { answeredCommand, guardDecision } from '../../core/rag-in/retrieve-answer.js'
import { estimateRagInEconomy, toLeverEvent, type RagInEconomy } from '../../core/rag-in/economy.js'
import { measuredFallbackTokens } from '../../core/rag-in/fallback-baseline.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'
import { extractLocalCorpus, mergeLocalCorpus, type LocalRunner } from '../../core/rag-in/local-extract.js'
import type { CommandChunk } from '../../core/rag-in/command-chunk.js'

const log = createLogger({ layer: 'cli', source: 'retrieve-command-cmd.ts' })

/** Real shell-out runner — best-effort, short timeout, null on any failure. */
const realRunner: LocalRunner = (cmd, args) => {
  try {
    // maxBuffer 32MB: `apropos .` can emit ~1MB+ (thousands of man entries),
    // which overflows execFileSync's 1MB default and would throw → null.
    return execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 4000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/**
 * Build the corpus, optionally augmented with environment-honest local
 * extraction (F2): the local chunks come straight from the machine, and the
 * builtin seed corpus is filtered to the tools actually present — so nothing
 * suggested is absent from this environment (harness commands always kept).
 */
function buildCorpus(local: boolean): CommandChunk[] {
  // Use live CLI surface so commands added to src/cli/index.ts but NOT to
  // COMMAND_REGISTRY (config) are always discoverable — overlay pattern.
  const base = buildLiveCorpus(CLI_COMMANDS)
  if (!local) return base
  // mergeLocalCorpus keeps the base intact if extraction yields nothing
  // (e.g. Windows without PowerShell) — never strips the seed to empty.
  return mergeLocalCorpus(base, extractLocalCorpus(realRunner))
}

/**
 * Price the retrieval and record it, in one pass over the store.
 *
 * The baseline lives in the store — the tokens `agf help` really emitted here — so the economy
 * cannot be computed before it opens. Without a project (or without a single measured help run)
 * the structural estimate stands, labelled as such.
 */
function settleEconomy(dir: string, result: Parameters<typeof estimateRagInEconomy>[0]): RagInEconomy {
  // Best-effort: openStoreIfExists returns undefined (never exits) when there is
  // no project at `dir`, so telemetry never kills the command.
  const store = openStoreIfExists(dir)
  if (!store) return estimateRagInEconomy(result)

  try {
    const db = store.getDb()
    const economy = estimateRagInEconomy(result, measuredFallbackTokens(db))
    // `'cli'` on every row was a comment, not an identifier. The span is persisted and closes
    // after thirty idle minutes; a harness that knows better sets AGF_SESSION_ID and wins.
    const sessionId = resolveSessionId(store, { sessionId: process.env.AGF_SESSION_ID, now: Date.now() })
    // A saving belongs to the task being worked. None in progress → the row stays unattributed,
    // which is what a benchmark looks like and how `agf savings` tells the two apart.
    recordLeverEvent(db, toLeverEvent(economy, sessionId, currentTaskId(db) ?? undefined))
    return economy
  } catch {
    /* telemetry is best-effort — the price of the retrieval is not */
    return estimateRagInEconomy(result)
  } finally {
    store.close()
  }
}

/**
 * RAG-IN: recover the exact command for a natural-language intent (instead of
 * generating it via LLM). Below the confidence gate it returns an explicit
 * `--help` fallback rather than guessing — never invents a command.
 */
export function retrieveCommandCommand(): Command {
  log.info('retrieve-command command registered')
  return new Command('retrieve-command')
    .description('RAG-IN: recupera o comando exato para uma intenção (fallback --help sob o limiar)')
    .argument('<intent>', 'Intenção em linguagem natural (ex.: "extrair tar.gz")')
    .option('--threshold <n>', 'Limiar de confiança do portão [0,1]', '0.5')
    .option('--limit <n>', 'Máximo de candidatos retornados', '3')
    .option('--local', 'Aumenta o corpus com extração local filtrada ao ambiente (man/--help/builtins)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((intent: string, opts: { threshold: string; limit: string; local?: boolean; dir: string }) => {
      const out = createCliOutput('retrieve-command')
      const corpus = buildCorpus(Boolean(opts.local))
      // guardDecision only ever removes an answer: a destructive command nobody asked for
      // becomes a `--help` fallback rather than a suggestion the agent might run.
      const result = guardDecision(
        retrieve(intent, corpus, {
          threshold: Number(opts.threshold),
          k: Number(opts.limit),
        }),
      )
      const economy = settleEconomy(opts.dir, result)
      out.ok(
        {
          decision: result.decision,
          confidence: result.confidence,
          // Below the gate this is null, never the rejected guess — see retrieve-answer.ts.
          command: answeredCommand(result),
          tool: result.top?.tool ?? null,
          family: result.top?.family ?? null,
          danger: result.top?.danger ?? false,
          fallback: result.fallback,
          candidates: result.candidates.map((c) => ({
            command: c.chunk.command,
            intent: c.chunk.intent,
            family: c.chunk.family,
            score: c.score,
          })),
          economy: {
            lever: economy.lever,
            saved: economy.saved,
            baselineTokens: economy.baselineTokens,
            baselineMethod: economy.baselineMethod,
            ...(economy.baselineSamples ? { baselineSamples: economy.baselineSamples } : {}),
          },
          corpusSize: corpus.length,
        },
        { count: result.candidates.length },
      )
    })
}
