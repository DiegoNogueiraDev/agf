/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Relatório de status do projeto — fonte única (DX) reusada pelo `agf status` (CLI)
 * e pelo `/status` (TUI). Recebe um store JÁ aberto; puro quanto a I/O de arquivo.
 */
import { selectProvider } from '../../core/model-hub/resolve-provider.js'
import { responseCacheEnabled } from '../../core/model-hub/caching-model-adapter.js'
import { resolveFailoverSpecs } from './provider-context.js'
import { detectAgfLlm } from './delegation.js'
import { summarizeLedger } from '../../core/observability/llm-call-ledger.js'
import { summarizeByLever } from '../../core/economy/economy-lever-ledger.js'
import { successfulNodeIds } from '../../core/store/episodic-outcomes-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { loadEconomyConfig, type LeverConfig } from '../../core/economy/economy-config.js'

export interface StatusReport {
  project: string | null
  /** Execution mode: `delegate` (external pilot drives agf) vs `live` (agf calls its own LLM). */
  mode: 'delegate' | 'live'
  /** Why: `delegated-cli:claude`, `provider-key:openrouter`, `none`, … — surfaces marker mismatches. */
  modeReason: string
  provider: string
  endpoint: string | null
  model: string
  cache: 'on' | 'off'
  failover: string[]
  tokens: { total: number; in: number; out: number; cached: number; reasoning: number }
  costUsd: number
  costPerSuccessUsd: number | null
  tokensSavedDeterministic: number
  levers: Array<{ lever: string; saved: number; count: number }>
  /** Top tasks by cost (from llm_call_ledger). */
  costByTask: Array<{ nodeId: string; costUsd: number; tokens: number }>
  /** Active economy lever configuration (from .agf/economy.toml or defaults). */
  economyConfig: LeverConfig
}

/** Coleta o status a partir de um store aberto + ambiente. */
export function collectStatus(store: SqliteStore, env: NodeJS.ProcessEnv = process.env): StatusReport {
  const providerSetting = store.getProjectSetting('provider') ?? env.AGF_PROVIDER ?? null
  const baseUrl = store.getProjectSetting('provider_base_url') ?? undefined
  const model = store.getProjectSetting('model') ?? 'auto'
  const choice = selectProvider(providerSetting, env, baseUrl)
  const ledger = summarizeLedger(store.getDb())
  const levers = summarizeByLever(store.getDb())
  const saved = levers.reduce((a, l) => a + l.totalSaved, 0)
  const successNodes = successfulNodeIds(store.getDb())
  const succeeded = ledger.byTask.filter((t) => successNodes.has(t.nodeId)).length
  const llm = detectAgfLlm(store, env)
  return {
    project: store.getProject()?.name ?? null,
    mode: llm.available ? 'live' : 'delegate',
    modeReason: `${llm.via}${llm.detail ? `:${llm.detail}` : ''}`,
    provider: choice.kind === 'copilot' ? 'copilot' : choice.providerId,
    endpoint: choice.kind === 'openai-compatible' ? choice.baseURL : null,
    model,
    cache: responseCacheEnabled(env) ? 'on' : 'off',
    failover: resolveFailoverSpecs(store, env).map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider)),
    tokens: {
      total: ledger.totals.total,
      in: ledger.totals.tokensIn,
      out: ledger.totals.tokensOut,
      cached: ledger.totals.cachedTokensIn,
      reasoning: ledger.totals.reasoningTokens,
    },
    costUsd: ledger.totals.costUsd,
    costPerSuccessUsd: succeeded > 0 ? ledger.totals.costUsd / succeeded : null,
    tokensSavedDeterministic: saved,
    levers: levers.map((l) => ({ lever: l.lever, saved: l.totalSaved, count: l.count })),
    costByTask: ledger.byTask
      .slice(0, 5)
      .map((t) => ({ nodeId: t.nodeId, costUsd: t.costUsd, tokens: t.tokensIn + t.tokensOut })),
    economyConfig: loadEconomyConfig(store.getProject()?.fsPath ?? process.cwd()),
  }
}

/** Renderiza o relatório em linhas amigáveis (texto). */
export function formatStatus(s: StatusReport): string[] {
  const usd = (n: number): string => `$${n.toFixed(4)}`
  const lines = [
    `agf status — projeto: ${s.project ?? '(sem nome)'}`,
    `  Modo     : ${s.mode} (${s.modeReason})`,
    `  Provider : ${s.provider}${s.endpoint ? ` (${s.endpoint})` : ''}`,
    `  Modelo   : ${s.model}`,
    `  Cache    : ${s.cache}`,
    ...(s.failover.length > 0 ? [`  Failover : ${s.failover.join(' → ')}`] : []),
    `  Tokens   : ${s.tokens.total} (in ${s.tokens.in} / out ${s.tokens.out}${s.tokens.cached ? ` · cache ${s.tokens.cached}` : ''}${s.tokens.reasoning ? ` · raciocínio ${s.tokens.reasoning}` : ''})`,
    `  Custo    : ${usd(s.costUsd)}${s.costPerSuccessUsd != null ? `  ·  por sucesso: ${usd(s.costPerSuccessUsd)}` : ''}`,
  ]
  if (s.tokensSavedDeterministic > 0) {
    lines.push(`  Economia : ${s.tokensSavedDeterministic} tokens evitados (determinístico/cache)`)
    for (const l of s.levers) lines.push(`     ${l.lever.padEnd(18)} ${l.saved} tok (${l.count}x)`)
  }
  if (s.costByTask.length > 0) {
    lines.push('  Custo por task (top):')
    for (const t of s.costByTask) {
      lines.push(`     ${t.nodeId.padEnd(22)} ${usd(t.costUsd)} · ${t.tokens} tok`)
    }
  }
  const ec = s.economyConfig
  lines.push('  Economy Levers:')
  lines.push(`     ast_compress.min_bytes    ${ec.ast_compress.min_bytes}`)
  lines.push(`     caveman.aggressiveness    ${ec.caveman.aggressiveness}`)
  lines.push(`     ccr.enabled               ${ec.ccr.enabled}`)
  lines.push(`     rag_in.threshold          ${ec.rag_in.threshold}  k=${ec.rag_in.k}`)
  lines.push(`     rag_out.threshold         ${ec.rag_out.threshold}  k=${ec.rag_out.k}`)
  return lines
}
