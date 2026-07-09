/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { execFileSync } from 'node:child_process'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreIfExists } from '../open-store.js'
import { retrieveCommand as retrieve } from '../../core/rag-in/retrieve.js'
import { buildLiveCorpus } from '../../core/rag-in/builtin-corpus.js'
import { CLI_COMMANDS } from '../index.js'
import { estimateRagInEconomy, toLeverEvent } from '../../core/rag-in/economy.js'
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

/** Record the RAG-IN economy lever when a project store is available (best-effort). */
function recordEconomy(dir: string, economy: ReturnType<typeof estimateRagInEconomy>): void {
  // Best-effort: openStoreIfExists returns undefined (never exits) when there is
  // no project at `dir`, so telemetry never kills the command.
  const store = openStoreIfExists(dir)
  if (!store) return
  try {
    const sessionId = process.env.AGF_SESSION_ID ?? 'cli'
    recordLeverEvent(store.getDb(), toLeverEvent(economy, sessionId))
  } catch {
    /* telemetry is best-effort */
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
      const result = retrieve(intent, corpus, {
        threshold: Number(opts.threshold),
        k: Number(opts.limit),
      })
      const economy = estimateRagInEconomy(result)
      recordEconomy(opts.dir, economy)
      out.ok(
        {
          decision: result.decision,
          confidence: result.confidence,
          command: result.top?.command ?? null,
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
          },
          corpusSize: corpus.length,
        },
        { count: result.candidates.length },
      )
    })
}
