/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 1.3) — registry hook→capability.
 * Cada um dos 28 pontos do ciclo de vida aponta para o módulo que JÁ implementa
 * a capacidade. O dispatch (Tasks 2.x) só nomeia o ponto — nada é reconstruído.
 * O teste de cobertura (hook-capability-registry.test.ts) trava drift e scope-creep.
 */

import { McpGraphError } from '../utils/errors.js'
import { HOOK_TAXONOMY, type HookTaxonomyPoint, type HookChannel } from './hook-types.js'

/** Dono de uma capacidade: módulo existente + descrição curta. */
export interface CapabilityOwner {
  /** Caminho (repo-relative) do módulo que já implementa a capacidade. */
  module: string
  /** O que esse módulo faz (1 linha). */
  capability: string
}

/** Erro tipado: ponto da taxonomia sem owner registrado. */
export class UnmappedHookPointError extends McpGraphError {
  constructor(public readonly point: string) {
    super(`Hook taxonomy point "${point}" has no capability owner`)
    this.name = 'UnmappedHookPointError'
  }
}

/** Mapa 28-pontos → módulo-owner (capacidade já existente). */
export const HOOK_CAPABILITY_REGISTRY = {
  // Fase A — início da task
  pre_task_start: {
    module: 'src/core/services/task-lifecycle.ts',
    capability: 'ciclo de vida da task (next→in_progress)',
  },
  post_task_start: {
    module: 'src/core/services/task-lifecycle.ts',
    capability: 'marcação in_progress + timestamp de início',
  },
  on_dependency_resolved: {
    module: 'src/core/planner/next-task.ts',
    capability: 'engine de pull/next — re-avaliação de tasks desbloqueadas',
  },
  // Fase B — montagem de contexto
  pre_context_build: {
    module: 'src/core/context/compact-context.ts',
    capability: 'montagem do TaskContext / context pack',
  },
  post_context_build: { module: 'src/core/context/compact-context.ts', capability: 'contexto montado + métricas' },
  on_context_change: {
    module: 'src/core/hooks/context-lifecycle-hooks.ts',
    capability: 'detecção de mudança de contexto + epoch versioning',
  },
  // Fase C — chamada LLM
  pre_llm_call: {
    module: 'src/core/hooks/llm-lifecycle-hooks.ts',
    capability: 'orquestração da chamada LLM (lifecycle hook)',
  },
  post_llm_call: {
    module: 'src/core/observability/llm-call-ledger.ts',
    capability: 'registro de outcome + tokens no ledger',
  },
  on_llm_error: {
    module: 'src/core/hooks/llm-lifecycle-hooks.ts',
    capability: 'classificação de erro + failover de provider',
  },
  on_llm_retry: {
    module: 'src/core/hooks/llm-lifecycle-hooks.ts',
    capability: 'exponential backoff + troca de modelo',
  },
  // Fase D — execução de ferramenta
  pre_tool_execute: { module: 'src/core/hooks/tool-lifecycle-hooks.ts', capability: 'PreToolUse — permission/guard' },
  post_tool_execute: {
    module: 'src/core/hooks/tool-lifecycle-hooks.ts',
    capability: 'PostToolUse — extração de learnings',
  },
  on_tool_error: {
    module: 'src/core/hooks/tool-lifecycle-hooks.ts',
    capability: 'PostToolUseFailure — self-heal/retry',
  },
  // Fase E — compressão & economia
  pre_compress: {
    module: 'src/core/tool-compress/index.ts',
    capability: 'compressão adaptativa de tool-output (L0/L1/L2) + lever no ledger — alavanca ativa na via real',
  },
  post_compress: { module: 'src/core/economy/lossy-gate.ts', capability: 'lossy-gate + savings percent no ledger' },
  on_cache_hit: { module: 'src/core/llm/response-cache.ts', capability: 'cache LLM — tokens economizados' },
  on_cache_miss: { module: 'src/core/llm/response-cache.ts', capability: 'cache miss — decisão de escrever cache' },
  on_budget_warning: { module: 'src/core/autonomy/budget-guard.ts', capability: 'guarda de budget de tokens (>80%)' },
  // Fase F — finalização da task
  pre_task_done: { module: 'src/core/services/task-lifecycle.ts', capability: 'DoD checks antes de done' },
  post_task_done: {
    module: 'src/core/services/task-lifecycle.ts',
    capability: 'promoção de épico + savings + memória',
  },
  on_task_fail: { module: 'src/core/services/task-lifecycle.ts', capability: 'registro de falha + confidence score' },
  on_circuit_break: {
    module: 'src/core/hooks/llm-lifecycle-hooks.ts',
    capability: 'HALT por N falhas consecutivas',
  },
  // Fase G — memória & aprendizado
  pre_compact: { module: 'src/core/context/compact-context.ts', capability: 'extração de memórias antes de comprimir' },
  post_compact: { module: 'src/core/context/compact-context.ts', capability: 'integridade pós-compact + savings' },
  on_learning_compile: {
    module: 'src/core/learning/learning-compiler.ts',
    capability: 'compilação de decisões em regras determinísticas',
  },
  on_feedback: {
    module: 'src/core/learning/sqlite-learning-store.ts',
    capability: 'registro de correção do usuário + confidence',
  },
  // Fase H — transversais
  pre_node_status_change: {
    module: 'src/core/orchestrator/lifecycle-gate.ts',
    capability: 'validação de status_flow + gate',
  },
  post_node_status_change: {
    module: 'src/core/hooks/enforcement-handlers.ts',
    capability: 'registro pós-transição de status (logging, side-effects)',
  },
  on_gate_check: {
    module: 'src/core/orchestrator/lifecycle-gate.ts',
    capability: 'avaliação de quality gate (pass/fail)',
  },
} as const satisfies Record<HookTaxonomyPoint, CapabilityOwner>

/** Owner de um ponto da taxonomia. Throw tipado se não mapeado. */
export function ownerOf(point: HookTaxonomyPoint): CapabilityOwner {
  const owner = HOOK_CAPABILITY_REGISTRY[point]
  if (!owner) throw new UnmappedHookPointError(point)
  return owner
}

/** Owner pelo canal resolvido (primeiro ponto da taxonomia que mapeia para ele). */
export function ownerOfChannel(channel: HookChannel): CapabilityOwner | undefined {
  for (const point of Object.keys(HOOK_TAXONOMY) as HookTaxonomyPoint[]) {
    if (HOOK_TAXONOMY[point] === channel) return HOOK_CAPABILITY_REGISTRY[point]
  }
  return undefined
}

/** Pontos da taxonomia sem owner (deve ser vazio — travado por teste). */
export function unmappedPoints(): HookTaxonomyPoint[] {
  return (Object.keys(HOOK_TAXONOMY) as HookTaxonomyPoint[]).filter((p) => !(p in HOOK_CAPABILITY_REGISTRY))
}
