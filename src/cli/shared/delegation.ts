/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Guarda de delegação — torna os comandos `--live` AGNÓSTICOS a provider.
 *
 * Se o `agf` tem LLM próprio (provider/copilot) → modo autônomo (segue o fluxo).
 * Se NÃO tem → em vez de quebrar, o comando devolve um **envelope delegado**: o
 * brief/prompt da task pronto p/ a CLI-agente que dirige (Claude/Copilot/Codex/…)
 * executar com o próprio LLM, e os `nextSteps` p/ fechar o loop via `agf submit`.
 * Assim o agf funciona inteiro mesmo sem o usuário conectar um provider.
 */
import { detectLlmAvailability, type LlmAvailability } from '../../core/model-hub/llm-availability.js'
import { detectActiveCLI } from '../../core/cli-provider/cli-provider.js'
import { buildEnrichedBrief, renderBriefPrompt, type ExecutorBrief } from '../../core/context/executor-brief.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { ScaffoldDescriptor } from '../../core/rag-out/gate.js'

/** Envelope returned when no LLM provider is connected — contains the ready-to-run brief for the driving CLI agent. */
export interface DelegatedEnvelope {
  mode: 'delegated'
  reason: string
  detected: LlmAvailability
  task?: { id: string; title: string }
  brief?: ExecutorBrief
  /** Prompt agnóstico pronto p/ o agente executar. */
  prompt: string
  /** Passos determinísticos p/ fechar o loop. */
  nextSteps: string[]
}

/**
 * Detecta se o agf tem LLM próprio. `override.provider` (flag --provider explícita)
 * conta como disponível. Lê settings persistidos + env (inclui OLLAMA_BASE_URL).
 */
export function detectAgfLlm(
  store?: SqliteStore,
  env: NodeJS.ProcessEnv = process.env,
  override?: { provider?: string; baseUrl?: string },
): LlmAvailability {
  // Explicit --provider wins: the user is forcing agf's own provider.
  if (override?.provider) return { available: true, via: 'provider-setting', detail: override.provider }

  // Modern agentic CLI driving agf (Claude/Copilot/Codex/opencode) IS the provider →
  // stay DELEGATED even if a provider key happens to exist. They don't need a provider;
  // they ARE one. Only fall back to a configured provider when running standalone.
  const driver = detectActiveCLI(undefined, env as Record<string, string | undefined>)
  if (driver) return { available: false, via: 'delegated-cli', detail: driver.source }

  return detectLlmAvailability({
    env,
    providerSetting: store?.getProjectSetting?.('provider') ?? env.AGF_PROVIDER,
    providerBaseUrl: store?.getProjectSetting?.('provider_base_url') ?? env.OLLAMA_BASE_URL,
  })
}

const REASON =
  'Nenhum provider conectado ao agf — delegando ao agente que dirige (modo any-CLI). Conecte um provider (agf provider use / agf login) para o modo autônomo.'

/**
 * Monta o envelope delegado. Com `taskId` + `store`: inclui o brief estruturado +
 * prompt + `agf submit`. Sem task (ad-hoc, ex.: `agf run`): só o prompt + passos.
 */
export async function buildDelegatedEnvelope(opts: {
  detected: LlmAvailability
  store?: SqliteStore
  taskId?: string
  /** Project directory — enables the memory-inject in the enriched brief. */
  projectDir?: string
  adHocPrompt?: string
  /** Scaffold corpus for the diff-edit economy directive (injectable for tests; default = built-in). */
  scaffoldCorpus?: readonly ScaffoldDescriptor[]
}): Promise<DelegatedEnvelope> {
  if (opts.taskId && opts.store) {
    const brief = await buildEnrichedBrief(opts.store, opts.taskId, {
      ...(opts.projectDir !== undefined ? { projectDir: opts.projectDir } : {}),
      ...(opts.scaffoldCorpus !== undefined ? { scaffoldCorpus: opts.scaffoldCorpus } : {}),
    })
    if (brief) {
      return {
        mode: 'delegated',
        reason: REASON,
        detected: opts.detected,
        task: { id: brief.task.id, title: brief.task.title },
        brief,
        prompt: renderBriefPrompt(brief),
        nextSteps: [
          'Execute o brief acima com seu próprio LLM (aplique os edits no workspace).',
          `Feche o loop: agf submit ${opts.taskId} --result '{"arquivos":["..."],"testes":{"passed":N,"failed":0},"desvios":[]}'`,
        ],
      }
    }
  }
  const prompt = opts.adHocPrompt ?? 'Implemente a próxima task do grafo (agf next → agf brief <id>).'
  return {
    mode: 'delegated',
    reason: REASON,
    detected: opts.detected,
    prompt,
    nextSteps: [
      'Execute o pedido com seu próprio LLM.',
      'Rastreie no grafo: agf import-prd / agf node add → agf next → agf brief <id> → agf submit <id> --result <json>.',
    ],
  }
}
