/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Loop autônomo com guardrails — dirige a máquina de estados do BUILD:
 *
 *   next (pull, WIP=1) → in_progress → [implementar com TDD] → DoD → done | escalate
 *
 * Guardrails inegociáveis:
 * - **WIP = 1**: uma task in_progress por vez (pull system, Little's Law).
 * - **DoD gate**: nunca marca `done` sem o Definition of Done passar.
 * - **Escalation**: para o loop e devolve controle ao humano quando o passo
 *   de implementação falha (TDD não ficou verde) ou um check `required` falha.
 * - **Budget (cost-runaway guard)**: `maxIterations` limita o gasto por sessão.
 *
 * O passo de *implementação* é um hook injetável (`implement`) — o tier-router
 * de modelos (Copilot CLI: cheap/build/frontier) pluga aqui. O default é um
 * dry-run que delega a decisão de prontidão ao DoD.
 */

/** Porta sobre o grafo — permite testar o loop sem SQLite. */
export interface AutopilotGraphPort {
  /** Próxima task desbloqueada (pull). `null` = nenhuma; `warning` = todas bloqueadas. */
  nextTask(): { id: string; title: string } | { warning: 'all_tasks_blocked' } | null
  /** backlog → in_progress. */
  markInProgress(id: string): void
  /** Roda o Definition of Done na task. */
  checkDone(id: string): { ready: boolean; failedRequired: string[] }
  /** in_progress → done. */
  markDone(id: string): void
}

export type AutopilotStepAction = 'in_progress' | 'done' | 'escalated'

/** Rich return value from the implement hook — captures error and token usage. */
export interface ImplementResult {
  success: boolean
  /** Error message (TDD output, stderr excerpt). Capped to 200 chars on the step. */
  error?: string
  /** Tokens used by this attempt (for cost attribution). */
  tokensUsed?: number
}

/** Context recorded on an escalated step for downstream diagnosis. */
export interface EscalationContext {
  /** How many implement attempts were made before escalating (≥1). */
  attempt: number
  /** First 200 chars of the last error message. Empty string when none provided. */
  lastError: string
  /** Cumulative tokens consumed across all attempts. 0 when not tracked. */
  tokensUsed: number
}

export interface AutopilotStep {
  nodeId: string
  title: string
  action: AutopilotStepAction
  detail: string
  /** Present only when action === 'escalated'. */
  escalationContext?: EscalationContext
}

export type AutopilotStopReason =
  | 'no_more_tasks'
  | 'budget_exhausted'
  | 'escalation'
  | 'all_blocked'
  | 'aborted'
  | 'colony_critical'
  | 'colony_degraded'

/** Sinal de cancelamento cooperativo (compatível com AbortSignal). */
/** Contexto passado ao hook {@link AutopilotOptions.onFailure}. */
export interface FailureContext {
  node: { id: string; title: string }
  /** Número da falha nesta task (1 = primeira falha de implementação). */
  attempt: number
}

/** Decisão do hook onFailure: tentar (uma vez) um fix, ou desistir. */
export interface RecoveryDecision {
  /** `true` → re-executa a implementação uma única vez; `false` → escala já. */
  retry: boolean
  /** Diagnóstico/recipe aplicado (para o detalhe do step). */
  reason?: string
}

/** Decisão do pre-gate {@link AutopilotOptions.beforeImplement}. */
export interface GateDecision {
  /** `true` → a task NÃO é implementada e escala (mesmo caminho do DoD-fail). */
  block: boolean
  /** Motivo do bloqueio (para o detalhe do step). */
  reason?: string
}

export interface AbortLike {
  readonly aborted: boolean
}

export interface AutopilotResult {
  steps: AutopilotStep[]
  completed: number
  escalated: number
  stopped: AutopilotStopReason
  /** Fraction of context tokens removed by auto-compression (0 when not triggered). */
  contextReductionPct?: number
}

export interface AutopilotOptions {
  /** Guard de custo: máximo de iterações (tasks) por sessão. */
  maxIterations: number
  /**
   * Passo de implementação (TDD). Retorna `true`/`false` ou um {@link ImplementResult}
   * com detalhes de erro e uso de tokens.
   * Default: dry-run que sempre "implementa" e deixa o DoD decidir prontidão.
   */
  implement?: (node: { id: string; title: string }) => Promise<boolean | ImplementResult> | boolean | ImplementResult
  /**
   * Hook de auto-cura (T3.2): chamado quando a implementação falha. O handler
   * diagnostica (recovery-recipes + MAPE-K), persiste o helper-record do fix, e
   * decide se vale UMA tentativa de fix. Se `retry` for `true`, a implementação
   * é re-executada exatamente uma vez; falhando de novo, escala (sem loop).
   * Ausente → comportamento idêntico ao pré-T3.2 (escala na primeira falha).
   */
  onFailure?: (ctx: FailureContext) => Promise<RecoveryDecision> | RecoveryDecision
  /**
   * Pre-gate opcional (opt-in) chamado ANTES de implementar cada task. Permite
   * plugar verificações determinísticas (~0 token) — ex.: `--gate-gaps`. Se
   * retornar `{ block: true }`, a task escala (mesmo caminho do DoD-fail) com
   * `reason` no detalhe. Ausente → comportamento idêntico ao legado.
   */
  beforeImplement?: (node: { id: string; title: string }) => Promise<GateDecision> | GateDecision
  /**
   * Hook de sucesso opcional (opt-in) chamado APÓS `markDone`. Para telemetria
   * que alimenta subsistemas (ex.: learning store). Best-effort: se lançar, o
   * loop NÃO quebra. Ausente → comportamento idêntico ao legado.
   */
  onSuccess?: (node: { id: string; title: string }) => Promise<void> | void
  /**
   * Callback opcional chamado a cada step registrado — permite UIs ao vivo
   * (TUI) reagirem ao progresso. Backward-compatible: sem ele, comportamento
   * idêntico.
   */
  onStep?: (step: AutopilotStep) => void
  /**
   * Sinal de cancelamento cooperativo (ex.: AbortSignal). Quando `aborted`, o
   * loop para entre iterações (não mata chamada em voo). Ausente → sem efeito.
   */
  signal?: AbortLike
  /**
   * §E5.3 — Colony health circuit breaker. When provided, called every
   * `colonyHealthInterval` cycles (default 10) to assess colony grade.
   * grade=F → stop with colony_critical; grade=D → stop with colony_degraded;
   * 3+ consecutive grade declines → stop with colony_degraded.
   */
  colonyHealthCheck?: () => { grade: import('../colony/colony-signals.js').HealthGrade }
  /**
   * How often (in iterations) to invoke colonyHealthCheck. Default: 10.
   */
  colonyHealthInterval?: number
  /**
   * Harvest hook (opt-in): called when the backlog is empty (nextTask → null).
   * Runs the deterministic harvest pass (migrate-ac / risk-triage /
   * wire-dormant → WIRE-tasks) and reports how many new tasks it generated.
   * `generated > 0` → the loop re-enters and drains the new wave (self-feeds);
   * `0` → the loop stops with 'no_more_tasks'. Ausente → comportamento idêntico
   * ao legado (para imediatamente no backlog vazio). Delete de código morto NÃO
   * entra aqui (fica human-gated); a colheita só GERA trabalho, nunca apaga.
   */
  onHarvest?: () => Promise<{ generated: number }> | { generated: number }
}

function isBlockedWarning(next: ReturnType<AutopilotGraphPort['nextTask']>): next is { warning: 'all_tasks_blocked' } {
  return next !== null && 'warning' in next
}

/**
 * Roda o loop autônomo até acabarem as tasks, estourar o budget, ou escalar.
 * Determinístico dado o port + hook — sem efeitos colaterais além do port.
 */
/** Normalise the implement hook return to a plain `boolean`. */
function resolveResult(raw: boolean | ImplementResult): { success: boolean; error: string; tokensUsed: number } {
  if (typeof raw === 'boolean') return { success: raw, error: '', tokensUsed: 0 }
  return {
    success: raw.success,
    error: (raw.error ?? '').slice(0, 200),
    tokensUsed: raw.tokensUsed ?? 0,
  }
}

const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }

/**
 * Extrai o motivo REAL de uma escalada (node_a540ef426973): o último step
 * escalado carrega o erro subjacente em `escalationContext.lastError` (ex.: o
 * 401 do provider). O caller (run-build) usa isto para enriquecer o throw em vez
 * de mascarar com um genérico "autopilot escalou" — assim classifyLlmError na
 * superfície vê o status real (auth/rate_limit/…), não `unknown`. Undefined
 * quando não houve escalada com motivo.
 */
export function escalationReason(result: AutopilotResult): string | undefined {
  for (let i = result.steps.length - 1; i >= 0; i -= 1) {
    const step = result.steps[i]
    const reason = step?.action === 'escalated' ? step.escalationContext?.lastError : undefined
    if (reason) return reason
  }
  return undefined
}

export async function runAutopilot(port: AutopilotGraphPort, options: AutopilotOptions): Promise<AutopilotResult> {
  const steps: AutopilotStep[] = []
  let completed = 0
  let escalated = 0
  const implement = options.implement ?? (() => true)
  const healthInterval = options.colonyHealthInterval ?? 10
  let lastGrade: string | null = null
  let consecutiveDeclines = 0
  // Registra um step e notifica a UI ao vivo (se houver onStep).
  const record = (step: AutopilotStep): void => {
    steps.push(step)
    options.onStep?.(step)
  }

  for (let i = 0; i < options.maxIterations; i++) {
    // Cancelamento cooperativo: checa antes de puxar/processar a próxima task.
    if (options.signal?.aborted === true) {
      return { steps, completed, escalated, stopped: 'aborted' }
    }

    // §E5.3 — Colony health circuit breaker (every healthInterval iterations).
    if (options.colonyHealthCheck && i > 0 && i % healthInterval === 0) {
      const { grade } = options.colonyHealthCheck()
      if (lastGrade !== null) {
        const prev = GRADE_ORDER[lastGrade] ?? 3
        const curr = GRADE_ORDER[grade] ?? 3
        if (curr < prev) {
          consecutiveDeclines++
        } else {
          consecutiveDeclines = 0
        }
      }
      lastGrade = grade

      if (grade === 'F') {
        record({
          nodeId: 'colony-health',
          title: 'Colony Health Circuit Breaker',
          action: 'escalated',
          detail: 'COLONY CRITICAL (grade F) — loop stopped',
        })
        return { steps, completed, escalated, stopped: 'colony_critical' }
      }
      if (grade === 'D' || consecutiveDeclines >= 3) {
        record({
          nodeId: 'colony-health',
          title: 'Colony Health Circuit Breaker',
          action: 'escalated',
          detail: `COLONY DEGRADED (grade ${grade}) → route to graph-quality skill`,
        })
        return { steps, completed, escalated, stopped: 'colony_degraded' }
      }
    }

    let next = port.nextTask()

    // Backlog-empty is the harvest TRIGGER, not the end. If onHarvest is provided
    // and produces new tasks (generated > 0), re-pull and drain them (self-feed).
    // Only when harvest is also dry (or absent) does the loop stop.
    if (next === null && options.onHarvest) {
      const { generated } = await options.onHarvest()
      if (generated > 0) {
        next = port.nextTask()
      }
    }

    if (next === null) {
      return { steps, completed, escalated, stopped: 'no_more_tasks' }
    }
    if (isBlockedWarning(next)) {
      return { steps, completed, escalated, stopped: 'all_blocked' }
    }

    // Pull + WIP=1: assume a task.
    port.markInProgress(next.id)
    record({ nodeId: next.id, title: next.title, action: 'in_progress', detail: 'assumida (WIP=1)' })

    // AUDIT-054 — a hook below (beforeImplement / implement / onFailure / checkDone /
    // markDone) may throw. A throw must escalate cleanly instead of escaping the loop —
    // an uncaught throw would leave the task stuck in_progress with WIP leaked.
    let attemptCount = 1
    let cumulativeTokens = 0
    // eslint-disable-next-line no-useless-assignment -- defensive default; reassigned per attempt before any read
    let lastError = ''
    try {
      // Pre-gate opt-in (determinístico, ~0 token): bloqueia → escala como DoD-fail.
      if (options.beforeImplement) {
        const gate = await options.beforeImplement({ id: next.id, title: next.title })
        if (gate.block) {
          escalated++
          record({
            nodeId: next.id,
            title: next.title,
            action: 'escalated',
            detail: `pre-gate: ${gate.reason ?? 'bloqueado'}`,
            escalationContext: { attempt: 0, lastError: gate.reason ?? '', tokensUsed: 0 },
          })
          return { steps, completed, escalated, stopped: 'escalation' }
        }
      }

      // Implementar (hook). Falha = TDD não verde.
      let rawResult = await implement({ id: next.id, title: next.title })
      let result = resolveResult(rawResult)
      cumulativeTokens = result.tokensUsed
      lastError = result.error

      // Auto-cura (T3.2): na falha, diagnostica + tenta UM fix antes de escalar.
      if (!result.success && options.onFailure) {
        const decision = await options.onFailure({ node: { id: next.id, title: next.title }, attempt: 1 })
        if (decision.retry) {
          record({
            nodeId: next.id,
            title: next.title,
            action: 'in_progress',
            detail: `self-heal: ${decision.reason ?? 'fix aplicado'} (retry 1x)`,
          })
          attemptCount = 2
          rawResult = await implement({ id: next.id, title: next.title }) // exatamente uma re-tentativa
          result = resolveResult(rawResult)
          cumulativeTokens += result.tokensUsed
          lastError = result.error || lastError
        }
      }

      if (!result.success) {
        escalated++
        record({
          nodeId: next.id,
          title: next.title,
          action: 'escalated',
          detail: `implementação falhou (TDD não verde) — attempt:${attemptCount}${lastError ? `, lastError: ${lastError.slice(0, 80)}` : ''}`,
          escalationContext: { attempt: attemptCount, lastError, tokensUsed: cumulativeTokens },
        })
        return { steps, completed, escalated, stopped: 'escalation' }
      }

      // DoD gate antes de done.
      const dod = port.checkDone(next.id)
      if (!dod.ready) {
        escalated++
        record({
          nodeId: next.id,
          title: next.title,
          action: 'escalated',
          detail: `DoD falhou: ${dod.failedRequired.join(', ')}`,
        })
        return { steps, completed, escalated, stopped: 'escalation' }
      }

      port.markDone(next.id)
      completed++
      record({ nodeId: next.id, title: next.title, action: 'done', detail: 'DoD ok' })
    } catch (err) {
      // A hook threw — convert to a clean escalated step (never crash the loop).
      const msg = err instanceof Error ? err.message : String(err)
      escalated++
      record({
        nodeId: next.id,
        title: next.title,
        action: 'escalated',
        detail: `hook lançou exceção — ${msg.slice(0, 120)}`,
        escalationContext: { attempt: attemptCount, lastError: msg.slice(0, 200), tokensUsed: cumulativeTokens },
      })
      return { steps, completed, escalated, stopped: 'escalation' }
    }

    // Telemetria de sucesso opt-in (best-effort: nunca quebra o loop).
    if (options.onSuccess) {
      try {
        await options.onSuccess({ id: next.id, title: next.title })
      } catch {
        /* telemetria nunca quebra o loop */
      }
    }
  }

  return { steps, completed, escalated, stopped: 'budget_exhausted' }
}
