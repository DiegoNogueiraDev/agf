/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf genesis <ideia>` — wires the pure runGenesis orchestrator
 * (§node_7159c356573c, src/core/orchestrator/genesis.ts) to production: init →
 * generate_prd (LLM via provider-context) → import_prd → decompose → gaps →
 * brief, num único round-trip.
 *
 * Decompose step: `detectLargeTasks` only DETECTS candidates (its DecomposeResult
 * has no subtasks/edges) — src/tests/genesis.test.ts's realHandlers feeds that
 * straight into `persistDecomposition`, a type mismatch that never surfaces at
 * runtime because src/tests/ is excluded from tsc and the sample PRD used there
 * never actually triggers a large task. The real per-task decomposition (AC → 1
 * subtask each) comes from `smartDecompose`; this handler calls it for every
 * candidate `detectLargeTasks` flags.
 */

import { Command } from 'commander'
import { runGenesis, type GenesisHandlers } from '../../core/orchestrator/genesis.js'
import { runGraphOnlySetup } from './init-cmd.js'
import { buildClientFromProject, type ProviderContext } from '../shared/provider-context.js'
import { generatePrd } from '../../core/prd/generate-prd.js'
import { extractEntities } from '../../core/parser/extract.js'
import { convertToGraph } from '../../core/importer/prd-to-graph.js'
import { detectLargeTasks } from '../../core/planner/decompose.js'
import { smartDecompose, persistDecomposition } from '../../core/planner/smart-decompose.js'
import { detectAllGaps } from '../../core/gaps/index.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { buildExecutorBrief, type ExecutorBrief } from '../../core/context/executor-brief.js'
import { openStoreOrFail, openStoreIfExists } from '../open-store.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { recordGenesisRun } from '../../core/orchestrator/genesis-metrics.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'genesis-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Assembles GenesisHandlers over `dir`, recording the one LLM call (generate_prd) into `ledger`. */
function buildGenesisHandlers(
  dir: string,
  ledger: TokenLedger,
  client: ProviderContext['client'],
): GenesisHandlers<ExecutorBrief> {
  return {
    init: () => runGraphOnlySetup(dir),
    generatePrd: (idea) =>
      generatePrd(idea, {
        generate: async (prompt) => {
          const res = await client.run('plan', prompt)
          ledger.recordCall('generate_prd', {
            model: res.model,
            prompt,
            response: res.text,
            reportedIn: res.tokensIn,
            reportedOut: res.tokensOut,
            reportedCachedIn: res.cachedTokensIn,
            reportedReasoning: res.reasoningTokens,
            fromCache: res.fromCache,
          })
          return res.text
        },
      }),
    importPrd: async (md) => {
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      const store = openStoreOrFail(dir)
      try {
        store.bulkInsert(graph.nodes, graph.edges)
        return { nodes: graph.nodes.length, edges: graph.edges.length }
      } finally {
        store.close()
      }
    },
    decompose: async () => {
      const store = openStoreOrFail(dir)
      try {
        const candidates = detectLargeTasks(store.toGraphDocument())
        let decomposed = 0
        for (const candidate of candidates) {
          const result = smartDecompose(store, candidate.node.id)
          if (result === null) continue
          persistDecomposition(store, result, candidate.node.id)
          decomposed++
        }
        return { decomposed }
      } finally {
        store.close()
      }
    },
    gaps: async () => {
      const store = openStoreOrFail(dir)
      try {
        const required = detectAllGaps(store.toGraphDocument()).filter((g) => g.severity === 'required')
        return { required: required.length }
      } finally {
        store.close()
      }
    },
    brief: async () => {
      const store = openStoreOrFail(dir)
      try {
        const next = findNextTask(store.toGraphDocument(), { pierceContainers: true })
        return next ? buildExecutorBrief(store, next.node.id) : null
      } finally {
        store.close()
      }
    },
  }
}

/** Persiste o ledger da sessão genesis no projeto (no-op sem store/entries). */
function persistGenesisLedger(dir: string, ledger: TokenLedger, providerLabel: string): void {
  if (ledger.entries().length === 0) return
  const store = openStoreIfExists(dir)
  if (store?.getProject()) {
    persistLedger(store.getDb(), ledger, { sessionId: 'genesis', provider: providerLabel })
  }
  store?.close()
}

/** Builds the `agf genesis` CLI command (Commander definition). */
export function genesisCommand(): Command {
  log.info('genesis command registered')
  return new Command('genesis')
    .description(
      'Criar um projeto do zero: ideia → grafo → primeiro brief em 1 round-trip (init → generate_prd → import_prd → decompose → gaps → brief)',
    )
    .argument('<ideia>', 'Descrição de 1 frase do que construir')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--model <id>', "Modelo fixo; 'auto' usa o tier-router", 'auto')
    .option('--provider <id>', 'Provider (ex.: openrouter, ollama); default copilot ou $AGF_PROVIDER')
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1 p/ Ollama)')
    .option('--review', 'Imprime o PRD gerado e PARA antes do import (guarda humana; default em TTY interativo)')
    .option('--no-review', 'Segue direto ao import mesmo em TTY interativo')
    .action(
      async (
        idea: string,
        opts: { dir: string; model: string; provider?: string; baseUrl?: string; review?: boolean },
      ) => {
        const out = createCliOutput('genesis')
        const settingsStore = openStoreIfExists(opts.dir)
        const { client, providerLabel } = buildClientFromProject(settingsStore, {
          provider: opts.provider,
          baseUrl: opts.baseUrl,
          model: opts.model === 'auto' ? undefined : opts.model,
        })
        progress(`[genesis] ${client.modelFor('plan')} via ${providerLabel} → ideia → grafo → primeiro brief…`)

        const ledger = new TokenLedger()
        const handlers = buildGenesisHandlers(opts.dir, ledger, client)

        // node_bcd488e481e4 — guarda humana contra PRD ruim: em --review (default
        // quando a sessão é um TTY interativo) o fluxo para ANTES do import e
        // devolve o PRD para aprovação; siga com --no-review ou `agf import-prd`.
        const wantsReview = opts.review ?? (process.stdout.isTTY === true && process.stdin.isTTY === true)
        if (wantsReview) {
          try {
            await handlers.init()
            const prd = await handlers.generatePrd(idea)
            persistGenesisLedger(opts.dir, ledger, providerLabel)
            settingsStore?.close()
            out.ok({
              ok: true,
              idea,
              review: true,
              prd,
              steps: [
                { name: 'init', ok: true },
                { name: 'generate_prd', ok: true },
              ],
            })
          } catch (err) {
            settingsStore?.close()
            out.fail('GENESIS_FAILED', `genesis --review falhou: ${err instanceof Error ? err.message : String(err)}`, {
              idea,
              review: true,
            })
          }
          return
        }

        const startedAt = Date.now()
        const report = await runGenesis(idea, handlers)
        const elapsedMs = Date.now() - startedAt
        settingsStore?.close()

        const ledgerStore = openStoreIfExists(opts.dir)
        if (ledgerStore?.getProject()) {
          if (ledger.entries().length > 0) {
            persistLedger(ledgerStore.getDb(), ledger, { sessionId: 'genesis', provider: providerLabel })
          }
          // node_64d196c10406 — time-to-first-brief como evidência: cada run bem-
          // sucedido grava sua própria linha {elapsedMs, tokensSpent, roundTrips=1}
          // que o `agf metrics` expõe contra o baseline manual.
          if (report.ok) {
            const tokensSpent = ledger.entries().reduce((sum, e) => sum + e.tokensIn + e.tokensOut, 0)
            recordGenesisRun(ledgerStore.getDb(), { elapsedMs, tokensSpent })
          }
        }
        ledgerStore?.close()

        if (!report.ok) {
          out.fail('GENESIS_FAILED', `genesis falhou na etapa "${report.failedStep}"`, report)
          return
        }
        out.ok(report)
      },
    )
}
