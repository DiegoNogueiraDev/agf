/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../../core/utils/logger.js'
import { buildClientFromProject } from '../shared/provider-context.js'
import { detectAgfLlm, buildDelegatedEnvelope } from '../shared/delegation.js'
import { openStoreIfExists } from '../open-store.js'
import { executePlan } from '../../core/autonomy/implementation-executor.js'
import { attemptImplementation, STABLE_SYSTEM_PROMPT } from '../../core/autonomy/implement-attempt.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'run-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Builds the `agf run` CLI command (Commander definition). */
export function runCommand(): Command {
  log.info('run command registered')
  return new Command('run')
    .description('Execução one-shot: implementa um prompt ad-hoc (gera → aplica → testa) via SDK do Copilot')
    .argument('<prompt>', 'Descrição da tarefa a implementar')
    .option('-d, --dir <dir>', 'Diretório de trabalho (workspace)', process.cwd())
    .option('--test-cmd <cmd>', 'Comando de teste rodado quando o plano não traz um', 'npm test')
    .option('--retries <n>', 'Tentativas com retry de feedback compacto do teste', '2')
    .option('--model <id>', "Modelo fixo; 'auto' usa o router do provider", 'auto')
    .option('--provider <id>', 'Provider (ex.: openrouter, ollama); default copilot ou $AGF_PROVIDER')
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1 p/ Ollama)')
    .action(
      async (
        prompt: string,
        opts: { dir: string; testCmd: string; retries: string; model: string; provider?: string; baseUrl?: string },
      ) => {
        const out = createCliOutput('run')
        const settingsStore = openStoreIfExists(opts.dir)

        // Modo delegado: sem provider próprio, não quebra — devolve o pedido p/ a
        // CLI-agente que dirige executar com o próprio LLM (any-CLI).
        const detected = detectAgfLlm(settingsStore ?? undefined, process.env, {
          provider: opts.provider,
          baseUrl: opts.baseUrl,
        })
        if (!detected.available) {
          const envelope = await buildDelegatedEnvelope({ detected, adHocPrompt: prompt })
          settingsStore?.close()
          out.ok(envelope)
          return
        }

        const { client, providerLabel } = buildClientFromProject(settingsStore, {
          provider: opts.provider,
          baseUrl: opts.baseUrl,
          model: opts.model === 'auto' ? undefined : opts.model,
        })
        const maxAttempts = Math.max(1, parseInt(opts.retries, 10) || 2)
        const ledger = new TokenLedger()
        const node = { id: `run_${randomUUID().replace(/-/g, '').slice(0, 8)}`, title: prompt }

        progress(`[run] ${client.modelFor('implement')} via ${providerLabel} → "${prompt}"`)
        const outcome = await attemptImplementation(
          {
            generate: async (p, effort) => {
              const res = await client.run('implement', p, STABLE_SYSTEM_PROMPT, undefined, effort)
              ledger.recordCall(node.id, {
                model: res.model,
                prompt: p,
                response: res.text,
                reportedIn: res.tokensIn,
                reportedOut: res.tokensOut,
                reportedCachedIn: res.cachedTokensIn,
                reportedReasoning: res.reasoningTokens,
                fromCache: res.fromCache,
              })
              if (res.fromCache) progress('[run] resposta reaproveitada do cache local — 0 token')
              return res.text
            },
            execute: (plan) => executePlan(plan, { workspaceDir: opts.dir, defaultTestCommand: opts.testCmd }),
          },
          { node, maxAttempts },
        )

        if (settingsStore?.getProject()) {
          persistLedger(settingsStore.getDb(), ledger, { sessionId: `run_${node.id}`, provider: 'copilot' })
        }
        settingsStore?.close()

        const files = outcome.lastResult?.applied.length ?? 0
        const totals = ledger.totals()
        const data = {
          success: outcome.success,
          attempts: outcome.attempts,
          files,
          tokensIn: totals.tokensIn,
          tokensOut: totals.tokensOut,
          tokensTotal: totals.total,
        }

        if (outcome.success) {
          out.ok(data)
        } else {
          out.fail('TESTS_FAILED', 'Tests did not pass', data)
        }
      },
    )
}
