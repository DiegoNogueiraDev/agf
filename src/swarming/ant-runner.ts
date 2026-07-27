/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-runner — a formiga em si: um ciclo de execução que percorre a colônia já
 * planejada pelo modelo frontier, ocupando um modelo BARATO só para executar.
 *
 * PORQUÊ: compõe o que JÁ EXISTE no core (do not recreate) —
 *   • pull atômico + identidade obrigatória → AgentClaimManager (anti-hijack);
 *   • próxima task → findNextTask (mesmo picker do `agf next`);
 *   • casta→tier → computeTaskCaste + casteToModelTier (roteamento por complexidade);
 *   • brief → buildExecutorBrief + renderBriefPrompt;
 *   • teto de gasto → BudgetGuard (para ANTES de gastar quando estourado);
 *   • atribuição por task → recordModelCall grava node_id no llm_call_ledger;
 *   • retorno → parseExecutorResult (schema {arquivos,testes,desvios});
 *   • honestidade → retorno inválido NUNCA vira done: task→blocked + finding.
 *
 * ISOLAMENTO: importa SÓ de core (nunca ../cli/../tui). O LLM e a aplicação dos
 * edits entram como PORTS injetáveis (DIP) — o runner é 100% testável com stub.
 * O gate real de DoD/blast é aplicado pela superfície `agf done`; aqui o runner
 * orquestra o lifecycle e delega o fechamento por transição validada do store.
 */

import { randomUUID } from 'node:crypto'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { findNextTask } from '../core/planner/next-task.js'
import { AgentClaimManager } from '../core/swarm/agent-claim-manager.js'
import { computeTaskCaste, casteToModelTier, type ModelTier } from '../core/colony/task-caste.js'
import { buildExecutorBrief, renderBriefPrompt, parseExecutorResult } from '../core/context/executor-brief.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import type { BudgetGuard } from '../core/autonomy/budget-guard.js'
import type { ExecutorResult } from '../core/context/executor-brief.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'core', source: 'ant-runner.ts' })

/** Porta do LLM: recebe o tier roteado + o prompt do brief, devolve o texto cru + tokens. */
export interface AntLlmPort {
  run(input: { tier: ModelTier; prompt: string; nodeId: string }): Promise<{
    text: string
    inputTokens: number
    outputTokens: number
    /** Identidade real do gateway (atribuição no ledger) — opcional em stubs. */
    provider?: string
    model?: string
  }>
}

export interface AntRunnerDeps {
  store: SqliteStore
  llm: AntLlmPort
  budget: BudgetGuard
  /** Identidade da formiga (obrigatória — plain pull sequestra task alheia). */
  agentId: string
  /** Aplica os edits do executor no workspace. Injetável; default no-op (teste/dry-run). */
  apply?: (result: ExecutorResult, nodeId: string) => void
  /** Id da sessão para o ledger (default: uuid por processo). */
  sessionId?: string
}

export type CycleStatus = 'done' | 'blocked' | 'budget_exhausted' | 'no_task'

export interface CycleResult {
  status: CycleStatus
  nodeId?: string
  tier?: ModelTier
  finding?: string
}

/**
 * Executa UM ciclo da formiga. Ordem crítica: o teto de budget é checado ANTES
 * de qualquer chamada LLM — estourado ⇒ para sem gastar (contador do LLM intacto).
 */
export async function runAntCycle(deps: AntRunnerDeps): Promise<CycleResult> {
  // AC3: budget primeiro — nenhuma chamada LLM quando já estourado.
  if (deps.budget.exceeded()) return { status: 'budget_exhausted' }

  const next = findNextTask(deps.store.toGraphDocument())
  if (!next) return { status: 'no_task' }
  const node = next.node

  // Pull atômico com identidade (lease+TTL) — anti-hijack do protocolo-formiga.
  new AgentClaimManager(deps.store.getDb()).tryClaim(node.id, deps.agentId)
  deps.store.updateNodeStatus(node.id, 'in_progress')

  // Roteamento casta→tier: a formiga barata pega a casta mínima no tier cheap.
  const tier = casteToModelTier(
    computeTaskCaste({
      type: node.type,
      priority: node.priority,
      acceptanceCriteria: node.acceptanceCriteria ?? [],
    }),
  )

  const brief = buildExecutorBrief(deps.store, node.id)
  const prompt = brief ? renderBriefPrompt(brief) : `Implemente a task ${node.id}: ${node.title}`

  const response = await deps.llm.run({ tier, prompt, nodeId: node.id })
  deps.budget.add(response.inputTokens + response.outputTokens)

  // Atribuição por task E por formiga (node_aa91e9665ac2): a linha carrega
  // node_id + agent_id + provider/model reais do port. Best-effort: falha de
  // gravação nunca derruba a formiga — o ciclo (e o status da task) seguem.
  try {
    recordModelCall(deps.store.getDb(), {
      sessionId: deps.sessionId ?? randomUUID(),
      nodeId: node.id,
      agentId: deps.agentId,
      caller: 'ant-runner',
      provider: response.provider ?? 'stub',
      model: response.model ?? tier,
      modelTier: tier,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    })
  } catch (err) {
    log.warn('Falha ao gravar atribuição no llm_call_ledger — ciclo segue', {
      node: node.id,
      agent: deps.agentId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const parsed = parseExecutorResult(response.text)
  if (!parsed) {
    // AC4: retorno inválido NUNCA vira done — task→blocked + finding rastreável.
    deps.store.updateNodeStatus(node.id, 'blocked')
    const finding = `Executor devolveu payload fora do schema {arquivos,testes,desvios} para ${node.id}`
    registerFinding(deps.store, node, finding)
    return { status: 'blocked', nodeId: node.id, tier, finding }
  }

  deps.apply?.(parsed, node.id)
  deps.store.updateNodeStatus(node.id, 'done')
  return { status: 'done', nodeId: node.id, tier }
}

/** Registra um nó de risco (finding) ligado à task que falhou o parse. */
function registerFinding(store: SqliteStore, task: GraphNode, message: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: `finding_${randomUUID().slice(0, 12)}`,
    type: 'risk',
    title: `FINDING: ${message}`,
    status: 'backlog',
    priority: 2,
    parentId: task.id,
    acceptanceCriteria: [],
    tags: ['ant-runner', 'executor-parse-fail'],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}
