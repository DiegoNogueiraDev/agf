/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Economy pipeline orchestrator — ADR-ruflo-07.
 * Stage order: Booster → Cache → Tier → Batch → Tiered → LLM.
 * Each stage is gated by an env flag (default off).
 */

/** Canonical pipeline stage order. */
export const ECONOMY_PIPELINE_ORDER = [
  'booster',
  'cache',
  'tier',
  'batch',
  'tiered',
  'compress',
  'content-router',
  'caveman-input',
  'llm',
] as const
export type EconomyStage = (typeof ECONOMY_PIPELINE_ORDER)[number]

type Next<Req, Res> = (req: Req) => Promise<Res>
type StageHandler<Req, Res> = (req: Req, next: Next<Req, Res>) => Promise<Res>

export type StageMap<Req, Res> = Partial<Record<EconomyStage, StageHandler<Req, Res>>>

/** Gating env var per stage (`undefined` = always on, e.g. `llm`). */
export const ECONOMY_STAGE_ENV_FLAGS: Record<EconomyStage, string | undefined> = {
  booster: 'ECONOMY_BOOSTER',
  cache: 'ECONOMY_CACHE',
  tier: 'ECONOMY_TIER_ROUTER',
  batch: 'ECONOMY_BATCH',
  tiered: 'ECONOMY_TIERED',
  compress: 'ECONOMY_COMPRESS',
  'content-router': 'ECONOMY_CONTENT_ROUTER',
  'caveman-input': 'ECONOMY_CAVEMAN_INPUT',
  llm: undefined,
}

/** Whether a stage's gating env flag currently allows it to run (default on). */
export function isStageEnabled(stage: EconomyStage): boolean {
  const flag = ECONOMY_STAGE_ENV_FLAGS[stage]
  if (!flag) return true
  return process.env[flag] !== 'off'
}

export interface EconomyPipelineOptions<Req, Res> {
  llmFn: (req: Req) => Promise<Res>
  stages?: StageMap<Req, Res>
}

/**
 * Builds a composed pipeline function.
 * Stages with disabled env flags are skipped; the request passes through to the next enabled stage.
 */
export function buildEconomyPipeline<Req, Res>(opts: EconomyPipelineOptions<Req, Res>): (req: Req) => Promise<Res> {
  const { llmFn, stages = {} } = opts

  const enabledStages = ECONOMY_PIPELINE_ORDER.filter(
    (s) => s !== 'llm' && isStageEnabled(s) && stages[s] !== undefined,
  ).map((s) => stages[s] as StageHandler<Req, Res>)

  if (enabledStages.length === 0) return llmFn

  const terminal: Next<Req, Res> = (req) => llmFn(req)

  const composed = enabledStages.reduceRight<Next<Req, Res>>((next, handler) => (req) => handler(req, next), terminal)

  return composed
}
