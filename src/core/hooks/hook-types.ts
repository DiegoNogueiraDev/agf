/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { McpGraphError } from '../utils/errors.js'

export class HookTimeoutError extends McpGraphError {
  constructor(
    public readonly handlerId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Hook handler "${handlerId}" exceeded timeout of ${timeoutMs}ms`)
    this.name = 'HookTimeoutError'
  }
}

export class HookCircuitOpenError extends McpGraphError {
  constructor(public readonly handlerId: string) {
    super(`Hook handler "${handlerId}" is disabled (circuit open)`)
    this.name = 'HookCircuitOpenError'
  }
}

/** Typed error for an unknown hook channel or taxonomy point (nunca throw de string crua). */
export class UnknownHookChannelError extends McpGraphError {
  constructor(public readonly channel: string) {
    super(`Unknown hook channel: "${channel}"`)
    this.name = 'UnknownHookChannelError'
  }
}

/** Typed error: um handler de status:pre-change negou (deny/halt) a transição. */
export class StatusChangeDeniedError extends McpGraphError {
  constructor(
    public readonly nodeId: string,
    public readonly from: string,
    public readonly to: string,
    public readonly reason: string,
  ) {
    super(`Status change ${from}→${to} for "${nodeId}" denied by hook: ${reason}`)
    this.name = 'StatusChangeDeniedError'
  }
}

export const HOOK_CHANNELS = [
  'session:start',
  'session:end',
  'agent:pre-spawn',
  'agent:post-spawn',
  'task:pre-execute',
  'task:post-complete',
  'task:error',
  // Acoplador determinístico — geração de scaffold/boilerplate (async).
  'scaffold:requested',
  'tool:pre-call',
  'tool:post-call',
  'memory:pre-store',
  'memory:post-store',
  'swarm:consensus-reached',
  'approval:required',
  // §EPIC-20.T01 — A2A Direct Communication: agent peer-to-peer message bus.
  'agent:p2p-send',
  'agent:p2p-receive',
  'agent:p2p-ack',
  // §EPIC Unified Hook Surface (Task 1.1) — canais aditivos do ciclo de vida (28-point taxonomy).
  // Fase A — início de task (post-start, dependency)
  'task:post-start',
  'task:dependency-resolved',
  // Fase B — montagem de contexto
  'context:pre-build',
  'context:post-build',
  'context:changed',
  // Fase C — chamada LLM
  'llm:pre-call',
  'llm:post-call',
  'llm:error',
  'llm:retry',
  // Fase D — execução de ferramenta (erro)
  'tool:error',
  // Fase E — compressão & economia
  'compress:pre',
  'compress:post',
  'cache:hit',
  'cache:miss',
  'budget:warning',
  // Fase F — finalização de task
  'task:pre-done',
  'circuit:break',
  'connectivity:regression',
  'spectra:regression',
  // Fase G — memória & aprendizado
  'compact:pre',
  'compact:post',
  'learning:compile',
  'learning:feedback',
  // Fase H — transversais
  'status:pre-change',
  'status:post-change',
  'gate:check',
  // Session/runtime layer — upward events surfaced to the application (TUI/Web/API).
  // NOTE: tool_approval_required reuses the existing 'approval:required' channel
  // (do NOT add a duplicate) so the approval audit trail stays single-sourced.
  'session:message-update',
  'session:mode-changed',
  'session:memory-staleness',
] as const

export const HookChannelSchema = z.enum(HOOK_CHANNELS)

export type HookChannel = z.infer<typeof HookChannelSchema>

/**
 * Taxonomia dos 28 pontos de hook do ciclo de vida → canal do HookBus.
 * Os 5 pontos com canal pré-existente REUSAM-no (não duplicar); os demais usam
 * canais aditivos. Cada capacidade subjacente já existe — aqui só nomeamos o ponto.
 */
export const HOOK_TAXONOMY = {
  // Fase A — início da task
  pre_task_start: 'task:pre-execute', // reuso
  post_task_start: 'task:post-start',
  on_dependency_resolved: 'task:dependency-resolved',
  // Fase B — montagem de contexto
  pre_context_build: 'context:pre-build',
  post_context_build: 'context:post-build',
  on_context_change: 'context:changed',
  // Fase C — chamada LLM
  pre_llm_call: 'llm:pre-call',
  post_llm_call: 'llm:post-call',
  on_llm_error: 'llm:error',
  on_llm_retry: 'llm:retry',
  // Fase D — execução de ferramenta
  pre_tool_execute: 'tool:pre-call', // reuso
  post_tool_execute: 'tool:post-call', // reuso
  on_tool_error: 'tool:error',
  // Fase E — compressão & economia
  pre_compress: 'compress:pre',
  post_compress: 'compress:post',
  on_cache_hit: 'cache:hit',
  on_cache_miss: 'cache:miss',
  on_budget_warning: 'budget:warning',
  // Fase F — finalização da task
  pre_task_done: 'task:pre-done',
  post_task_done: 'task:post-complete', // reuso
  on_task_fail: 'task:error', // reuso
  on_circuit_break: 'circuit:break',
  // Fase G — memória & aprendizado
  pre_compact: 'compact:pre',
  post_compact: 'compact:post',
  on_learning_compile: 'learning:compile',
  on_feedback: 'learning:feedback',
  // Fase H — transversais
  pre_node_status_change: 'status:pre-change',
  post_node_status_change: 'status:post-change',
  on_gate_check: 'gate:check',
} as const satisfies Record<string, HookChannel>

export type HookTaxonomyPoint = keyof typeof HOOK_TAXONOMY

export const HOOK_TAXONOMY_POINTS = Object.keys(HOOK_TAXONOMY) as HookTaxonomyPoint[]

/** Resolve um ponto da taxonomia (28) para o canal do HookBus. Throw tipado se desconhecido. */
export function resolveHookChannel(point: HookTaxonomyPoint): HookChannel {
  const channel = HOOK_TAXONOMY[point]
  if (!channel) throw new UnknownHookChannelError(point)
  return channel
}

/** Valida uma string como canal conhecido; throw tipado (UnknownHookChannelError) se não for. */
export function assertHookChannel(channel: string): HookChannel {
  const result = HookChannelSchema.safeParse(channel)
  if (!result.success) throw new UnknownHookChannelError(channel)
  return result.data
}

// ── HookActionResult — modelo de ação do HookBus (Task 1.2) ──
// Distinto do `HookResult` estreito de tool-hook.schema.ts (allow boolean,
// específico de tool-lifecycle). Aqui é o resultado genérico dos 28 canais.

/** Ações que um handler pode retornar ao dispatch. */
export const HOOK_ACTIONS = ['allow', 'deny', 'modify', 'record', 'halt'] as const

export const HookActionSchema = z.enum(HOOK_ACTIONS)

export type HookAction = z.infer<typeof HookActionSchema>

export const HookActionResultSchema = z.object({
  action: HookActionSchema,
  /** Motivo — propagado em deny/halt para o chamador. */
  reason: z.string().optional(),
  /** Payload mutado — usado por modify. */
  payload: z.record(z.string(), z.unknown()).optional(),
})

export type HookActionResult = z.infer<typeof HookActionResultSchema>

/** Tipos de handler: síncrono (determinístico, <10ms, qualquer ação) vs assíncrono (só record). */
export const HOOK_HANDLER_KINDS = ['sync', 'async'] as const

export type HookHandlerKind = (typeof HOOK_HANDLER_KINDS)[number]

/** Erro tipado: handler assíncrono tentou uma ação que bloqueia/altera o fluxo. */
export class AsyncHandlerActionError extends McpGraphError {
  constructor(public readonly attempted: HookAction) {
    super(`Async hook handlers may only "record"; got "${attempted}"`)
    this.name = 'AsyncHandlerActionError'
  }
}

// Construtores ergonômicos.
/** Hook result that allows the action to proceed unchanged. */
export const allow = (): HookActionResult => ({ action: 'allow' })
/** Hook result that denies the action with a reason. */
export const deny = (reason: string): HookActionResult => ({ action: 'deny', reason })
/** Hook result that mutates the action payload before proceeding. */
export const modify = (payload: Record<string, unknown>): HookActionResult => ({ action: 'modify', payload })
/** Hook result that records the event without altering the action. */
export const record = (): HookActionResult => ({ action: 'record' })
/** Hook result that halts the pipeline with a reason. */
export const halt = (reason: string): HookActionResult => ({ action: 'halt', reason })

/** Bloqueia o fluxo? (deny ou halt) */
export function isBlocking(result: HookActionResult): boolean {
  return result.action === 'deny' || result.action === 'halt'
}

/** Emergency-stop do loop? */
export function isHalt(result: HookActionResult): boolean {
  return result.action === 'halt'
}

/** Precedência ao folder múltiplos handlers: halt > deny > modify > record > allow. */
const ACTION_PRECEDENCE: Record<HookAction, number> = {
  halt: 4,
  deny: 3,
  modify: 2,
  record: 1,
  allow: 0,
}

/**
 * Combina os resultados de vários handlers num único resultado.
 * - halt vence tudo (emergency-stop); deny faz short-circuit com reason.
 * - modify acumula (merge) os payloads na ordem de execução.
 * - record/allow não interferem no payload.
 */
export function reduceHookResults(results: readonly HookActionResult[]): HookActionResult {
  let winner: HookActionResult = allow()
  let mergedPayload: Record<string, unknown> | undefined
  for (const r of results) {
    if (r.action === 'modify' && r.payload) {
      mergedPayload = { ...(mergedPayload ?? {}), ...r.payload }
    }
    if (ACTION_PRECEDENCE[r.action] > ACTION_PRECEDENCE[winner.action]) {
      winner = r
    }
  }
  if (winner.action === 'modify') {
    return { action: 'modify', payload: mergedPayload ?? winner.payload }
  }
  return winner
}

/** Valida que um handler assíncrono só retorna `record`; senão, throw tipado. */
export function assertAsyncActionAllowed(kind: HookHandlerKind, result: HookActionResult): HookActionResult {
  if (kind === 'async' && result.action !== 'record') {
    throw new AsyncHandlerActionError(result.action)
  }
  return result
}

export const HookEventSchema = z.object({
  channel: HookChannelSchema,
  timestamp: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
})

export type HookEvent = z.infer<typeof HookEventSchema>

export const HookHandlerSchema = z.custom<(event: HookEvent) => Promise<void>>(
  (fn) => typeof fn === 'function' && (fn as { constructor: { name: string } }).constructor.name === 'AsyncFunction',
  { error: 'HookHandler must be an async function' },
)

export type HookHandler = (event: HookEvent) => Promise<void>

export const HookRegistrationSchema = z.object({
  id: z.string().min(1),
  channel: HookChannelSchema,
  handler: HookHandlerSchema,
  priority: z.number().int().default(0),
})

export type HookRegistration = z.infer<typeof HookRegistrationSchema>
