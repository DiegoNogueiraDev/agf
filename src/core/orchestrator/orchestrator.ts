/**
 * §node_850e6a8d351d — Orquestrador de entrega: delega para PolicyEngine.defaultRules.
 * Mantém a interface DeliveryDecision para zero breaking change.
 */
import { PolicyEngine, type ContextInput } from '../policy/policy-engine.js'

export interface DeliveryState {
  totalNodes: number
  hasRequirements: boolean
  oversizedCount: number
  readyTasks: number
  inProgress: number
  allBlocked: boolean
  doneRatio: number
}

export type DeliveryAction = 'import_prd' | 'decompose' | 'implement' | 'escalate' | 'done'

export interface DeliveryDecision {
  action: DeliveryAction
  reason: string
}

const engine = new PolicyEngine(PolicyEngine.defaultRules())

const REASON_MAP: Record<string, string> = {
  import_prd: 'Grafo sem PRD — importe requisitos primeiro.',
  decompose: 'Epic(s)/task(s) L/XL sem subtasks — decompor antes de implementar.',
  implement: 'Tasks prontas ou em andamento — implementar (TDD).',
  done: 'Todas as tasks concluídas — entrega completa.',
  escalate: 'Sem tasks acionáveis ou todas bloqueadas — escalando para o humano.',
}

export function nextDeliveryAction(state: DeliveryState): DeliveryDecision {
  const ctx: ContextInput = {
    totalNodes: state.totalNodes,
    hasRequirements: state.hasRequirements,
    oversizedCount: state.oversizedCount,
    readyTasks: state.readyTasks,
    inProgress: state.inProgress,
    allBlocked: state.allBlocked,
    doneRatio: state.doneRatio,
  }
  const result = engine.evaluate(ctx)
  const action = result.actions[0]?.type as DeliveryAction | undefined
  const resolved = action ?? 'escalate'
  return { action: resolved, reason: REASON_MAP[resolved] ?? 'Sem decisão — escalando.' }
}
