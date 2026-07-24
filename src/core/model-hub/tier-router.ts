/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tier-router — "modelo certo p/ tarefa certa" (RFC §5.5 / §6.7). Classifica
 * cada tarefa num tier e resolve para um modelo concreto do pool do GitHub
 * Copilot CLI. A invocação real (via SDK do GitHub Copilot) vive num
 * `ModelAdapter` separado; este módulo é pura política de roteamento.
 *
 * Tiers:
 *   cheap    — classificar/status/dedupe (Haiku, mini)
 *   build    — implementar/editar/revisar (Sonnet, Codex) — default
 *   frontier — planejar/decompor/sintetizar (Opus, GPT-5.4, Gemini)
 */
import { z } from 'zod/v4'
import { PlannerError } from '../utils/errors.js'
import type { InternalPhase } from '../lifecycle/phase.js'

export const ModelTierSchema = z.enum(['cheap', 'build', 'frontier'])
export type ModelTier = z.infer<typeof ModelTierSchema>
export const MODEL_TIERS = ModelTierSchema.options

/**
 * Phase-aware tier mapping. When a lifecycle phase is known, it overrides
 * the task-kind heuristic. SHAPE phases (ANALYZE/DESIGN/PLAN) need deep
 * reasoning; BUILD phases (IMPLEMENT/VALIDATE) execute incrementally;
 * SHIP phases use frontier for deploy gates, cheap for listening feedback.
 *
 * Token savings: ~40-60% vs always using frontier for everything.
 */
export const PHASE_TIER_MAP: Record<InternalPhase, ModelTier> = {
  ANALYZE: 'frontier',
  DESIGN: 'frontier',
  PLAN: 'frontier',
  IMPLEMENT: 'build',
  VALIDATE: 'build',
  REVIEW: 'build',
  HANDOFF: 'build',
  DEPLOY: 'frontier',
  LISTENING: 'cheap',
}

export interface ModelDef {
  /** ID canônico (kebab) usado internamente e persistido. */
  id: string
  /** Rótulo como aparece no seletor do Copilot CLI. */
  label: string
  tier: ModelTier
}

/** Anthropic canonical model IDs for each tier (Haiku-first cost strategy). */
export const ANTHROPIC_CHEAP_DEFAULT = 'claude-haiku-4-5'
export const ANTHROPIC_BUILD_DEFAULT = 'claude-sonnet-4-6'
export const ANTHROPIC_FRONTIER_DEFAULT = 'claude-opus-4-8'

/**
 * Pool do GitHub Copilot CLI (seletor "Select Model"). "Auto" não é um modelo —
 * é o modo de roteamento (ver RouterConfig.mode === "auto").
 * Claude Anthropic models are listed first in each tier as the preferred defaults.
 */
export const MODEL_POOL: ModelDef[] = [
  // cheap — classificar/status, baixo custo (Haiku-first)
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'cheap' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash ⚡', tier: 'cheap' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', tier: 'cheap' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', tier: 'cheap' },
  // build — implementar/editar/revisar (Sonnet 4.6 default)
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'build' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick ⚡', tier: 'build' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'build' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', tier: 'build' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', tier: 'build' },
  { id: 'gpt-5.2', label: 'GPT-5.2', tier: 'build' },
  // frontier — planejar/decompor/sintetizar (Opus 4.8 default)
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', tier: 'frontier' },
  { id: 'qwen/qwen3.6-plus', label: 'Qwen 3.6 Plus 🏆', tier: 'frontier' },
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', tier: 'frontier' },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', tier: 'frontier' },
  { id: 'gpt-5.4', label: 'GPT-5.4', tier: 'frontier' },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Preview)', tier: 'frontier' },
]

/** Default: Claude Sonnet 4.6 — Haiku-first strategy; build tier anchors on Sonnet 4.6. */
export const DEFAULT_MODEL = ANTHROPIC_BUILD_DEFAULT

export const TaskKindSchema = z.enum(['classify', 'status', 'implement', 'review', 'plan'])
export type TaskKind = z.infer<typeof TaskKindSchema>

/** Mapeia o tipo de tarefa ao tier (barato classifica, frontier sintetiza). */
export function tierForTask(kind: TaskKind): ModelTier {
  switch (kind) {
    case 'classify':
    case 'status':
      return 'cheap'
    case 'implement':
    case 'review':
      return 'build'
    case 'plan':
      return 'frontier'
  }
}

/** Return true when `id` matches a model in the built-in MODEL_POOL (not an external/OpenRouter model). */
export function isKnownModel(id: string): boolean {
  return MODEL_POOL.some((m) => m.id === id)
}

/**
 * Id de modelo externo (provider openai-compatible). Cobre dois formatos: slug
 * com `/` (OpenRouter/DeepSeek, ex.: `deepseek/deepseek-chat`) e tag com `:`
 * (Ollama, ex.: `qwen2.5-coder:14b`). Nenhum modelo do pool interno usa `/` ou `:`.
 */
export function looksExternalModel(id: string): boolean {
  return id.includes('/') || id.includes(':')
}

/**
 * Tier-map OpenRouter (auto): baseado em benchmark MoE (jun/2026).
 * cheap → DeepSeek V4 Flash: 60% resolve, $0.10/M, 1M ctx ← melhor custo
 * build → Llama 4 Maverick: 60% resolve, $0.15/M, 4.6k tok/task ← mais eficiente
 * frontier → Qwen 3.6 Plus: 80% resolve, $0.33/M, 1M ctx ← melhor qualidade
 */
export const OPENROUTER_TIER_MAP: Record<ModelTier, string> = {
  cheap: 'deepseek/deepseek-v4-flash',
  build: 'meta-llama/llama-4-maverick',
  frontier: 'qwen/qwen3.6-plus',
}

/** Resolve um tier para um modelo OpenRouter concreto. */
export function resolveOpenRouterModel(tier: ModelTier): string {
  return OPENROUTER_TIER_MAP[tier]
}

/** Return all model definitions that belong to a given tier (cheap, build, or frontier). */
export function modelsForTier(tier: ModelTier): ModelDef[] {
  return MODEL_POOL.filter((m) => m.tier === tier)
}

/**
 * Resolve um tier para um modelo concreto: prefere o default (Sonnet 4.6) se ele
 * pertence ao tier; senão o primeiro do tier. Garante fallback se o pool de um
 * tier estiver vazio (nunca deveria) — cai para o default frontier.
 */
export function resolveTierModel(tier: ModelTier): string {
  const candidates = modelsForTier(tier)
  if (candidates.length === 0) {
    const frontier = modelsForTier('frontier')
    if (frontier.length === 0) throw new PlannerError('Pool de modelos vazio')
    return frontier[0].id
  }
  // Prefer the ANTHROPIC_*_DEFAULT for the tier; otherwise the first in the tier list.
  const tierDefault =
    tier === 'cheap' ? ANTHROPIC_CHEAP_DEFAULT : tier === 'build' ? ANTHROPIC_BUILD_DEFAULT : ANTHROPIC_FRONTIER_DEFAULT
  const preferred = candidates.find((m) => m.id === tierDefault)
  return (preferred ?? candidates[0]).id
}

/** Config de roteamento: auto (por tarefa) ou pinned (modelo fixo). */
export type RouterConfig = { mode: 'auto' } | { mode: 'pinned'; modelId: string }

/**
 * Task features for contextual routing. Extracted from TaskContext.
 * Used to make routing decisions based on task complexity.
 */
export interface TaskFeatures {
  /** Number of acceptance criteria (higher = more complex). */
  acCount: number
  /** Number of dependencies (higher = more complex). */
  dependencyCount: number
  /** Number of blockers (higher = more complex). */
  blockerCount: number
  /** Task size estimate (S/M/L/XL). */
  xpSize?: string
  /** Task tags (can indicate complexity). */
  tags?: string[]
}

/**
 * Extract task features from a TaskContext-like object.
 * Pure function — no side effects.
 */
export function extractTaskFeatures(ctx: {
  acceptanceCriteria?: string[]
  dependsOn?: Array<{ id: string }>
  blockers?: Array<{ id: string }>
  task?: { xpSize?: string; tags?: string[] }
}): TaskFeatures {
  return {
    acCount: ctx.acceptanceCriteria?.length ?? 0,
    dependencyCount: ctx.dependsOn?.length ?? 0,
    blockerCount: ctx.blockers?.length ?? 0,
    xpSize: ctx.task?.xpSize,
    tags: ctx.task?.tags,
  }
}

/**
 * Compute task complexity score from features.
 * Higher score = more complex task = should use more capable model.
 *
 * Heuristic (deterministic, 0 tokens):
 * - AC count: each AC adds 2 points (more criteria = more complexity)
 * - Dependencies: each adds 3 points (integration complexity)
 * - Blockers: each adds 5 points (blocked tasks are harder)
 * - Size: S=0, M=5, L=10, XL=15
 */
export function computeComplexityScore(features: TaskFeatures): number {
  let score = 0
  score += features.acCount * 2
  score += features.dependencyCount * 3
  score += features.blockerCount * 5

  // Size bonus
  switch (features.xpSize) {
    case 'S':
      score += 0
      break
    case 'M':
      score += 5
      break
    case 'L':
      score += 10
      break
    case 'XL':
      score += 15
      break
  }

  // Tag-based adjustments
  if (features.tags?.includes('bug')) score += 3
  if (features.tags?.includes('security')) score += 5
  if (features.tags?.includes('architecture')) score += 4

  return score
}

/**
 * Route based on complexity score. Thresholds calibrated from empirical data:
 * - score < 10: cheap (simple tasks)
 * - score 10-25: build (medium complexity)
 * - score > 25: frontier (high complexity)
 */
export function tierForComplexity(score: number): ModelTier {
  if (score < 10) return 'cheap'
  if (score <= 25) return 'build'
  return 'frontier'
}

/** Resolve a tarefa para um modelo concreto segundo a config. */
export function routeModel(config: RouterConfig, kind: TaskKind, phase?: InternalPhase): string {
  if (config.mode === 'pinned') {
    // Ids externos (provider openai-compatible, ex.: deepseek/deepseek-chat) passam
    // direto; só validamos contra o pool interno os ids "conhecidos".
    if (!isKnownModel(config.modelId) && !looksExternalModel(config.modelId)) {
      throw new PlannerError(`Modelo fixado desconhecido: ${config.modelId}`)
    }
    return config.modelId
  }

  // Phase-aware routing: lifecycle phase overrides task-kind heuristic.
  // ANALYZE/DESIGN/PLAN → frontier (deep reasoning)
  // IMPLEMENT/VALIDATE → build (incremental execution)
  // REVIEW/HANDOFF → build (review/docs)
  // DEPLOY → frontier (release validation)
  // LISTENING → cheap (feedback)
  const tier = phase ? PHASE_TIER_MAP[phase] : tierForTask(kind)
  return resolveTierModel(tier)
}

/**
 * Task-aware routing with complexity scoring.
 * Uses task features to choose the optimal model tier.
 *
 * @param config - Router configuration (auto or pinned)
 * @param kind - Task kind (classify/status/implement/review/plan)
 * @param phase - Optional lifecycle phase
 * @param features - Optional task features for complexity scoring
 * @returns Model ID
 */
export function routeModelAware(
  config: RouterConfig,
  kind: TaskKind,
  phase?: InternalPhase,
  features?: TaskFeatures,
): string {
  if (config.mode === 'pinned') {
    if (!isKnownModel(config.modelId) && !looksExternalModel(config.modelId)) {
      throw new PlannerError(`Modelo fixado desconhecido: ${config.modelId}`)
    }
    return config.modelId
  }

  // Phase-aware routing takes precedence
  if (phase) {
    const tier = PHASE_TIER_MAP[phase]
    return resolveTierModel(tier)
  }

  // Task-aware routing with complexity scoring
  if (features) {
    const complexityScore = computeComplexityScore(features)
    const tier = tierForComplexity(complexityScore)
    return resolveTierModel(tier)
  }

  // Fallback to basic task-kind routing
  const tier = tierForTask(kind)
  return resolveTierModel(tier)
}

/**
 * Roteamento ciente do provider. Para `openrouter` em modo `auto`, roteia pelo
 * tier-map OpenRouter (DeepSeek por tier); senão delega ao {@link routeModel}
 * (Copilot/pool interno). Pinned passa direto em qualquer provider.
 */
export function routeModelForProvider(
  config: RouterConfig,
  kind: TaskKind,
  providerId: string | undefined,
  phase?: InternalPhase,
): string {
  if (config.mode === 'pinned') return routeModel(config, kind, phase)
  if (providerId === 'openrouter') {
    const tier = phase ? PHASE_TIER_MAP[phase] : tierForTask(kind)
    return resolveOpenRouterModel(tier)
  }
  return routeModel(config, kind, phase)
}

// ── Cascata FrugalGPT (A.T2, node_2c0df23446f2; contract node_653ff13c49fe) ──

/** Veredito do juiz determinístico (shape do cascade-verifier — zero LLM). */
export interface CascadeVerdictLike {
  pass: boolean
  score: number
  reasons: string[]
}

export interface CascadeCallResult {
  text: string
  costUsd?: number
}

export interface CascadeInput {
  /** Ordem barato→caro (ids/tiers de modelo — genérico por DIP). */
  tiers: readonly string[]
  /** Executor injetado: faz a chamada real. O laço nunca conhece o provider. */
  call: (model: string) => Promise<CascadeCallResult>
  /** Juiz determinístico (cascade-verifier.ts) — decide aceitar o draft. */
  verify: (text: string) => CascadeVerdictLike
  /** Máximo de escaladas. Default 1 (FrugalGPT: limita o desperdício por chamada). */
  maxEscalations?: number
  /** Callback por escalada — o chamador wira o ledger (recordTierEscalation). */
  onEscalation?: (e: { from: string; to: string; reason: string }) => void
}

export interface CascadeOutcome {
  response: string
  tierUsed: string
  escalations: number
  /** true quando todos os tiers permitidos reprovaram — devolvemos o MELHOR draft. */
  escalationExhausted: boolean
  verdict: CascadeVerdictLike
}

/**
 * Laço draft→verify→escalate: gera no tier barato, aceita se o verificador
 * aprovar, escala no máximo `maxEscalations` vezes. Todos reprovaram → devolve
 * a melhor resposta por score (nunca uma chamada extra). Sucesso no barato =
 * zero chamadas ao caro — a economia da cascata (FrugalGPT, arXiv 2305.05176).
 */
export async function runCascade(input: CascadeInput): Promise<CascadeOutcome> {
  const maxEscalations = input.maxEscalations ?? 1
  const attempts: Array<{ model: string; text: string; verdict: CascadeVerdictLike }> = []

  let idx = 0
  for (;;) {
    const model = input.tiers[idx]
    const result = await input.call(model)
    const verdict = input.verify(result.text)
    attempts.push({ model, text: result.text, verdict })

    if (verdict.pass) {
      return { response: result.text, tierUsed: model, escalations: idx, escalationExhausted: false, verdict }
    }
    const canEscalate = idx < maxEscalations && idx + 1 < input.tiers.length
    if (!canEscalate) break

    input.onEscalation?.({
      from: model,
      to: input.tiers[idx + 1],
      reason: `verificador reprovou: ${verdict.reasons.join('; ') || `score ${verdict.score}`}`,
    })
    idx += 1
  }

  const best = attempts.reduce((a, b) => (b.verdict.score > a.verdict.score ? b : a))
  return {
    response: best.text,
    tierUsed: best.model,
    escalations: attempts.length - 1,
    escalationExhausted: true,
    verdict: best.verdict,
  }
}
