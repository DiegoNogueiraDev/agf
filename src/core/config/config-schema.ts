/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { LspConfigOverrideSchema } from '../lsp/lsp-types.js'
const BROWSER_PILOT_MODELS = ['claude-3.5-sonnet', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'] as const

export const ContextModeSchema = z.enum(['ultra-lean', 'lean', 'full'])
export type ContextMode = z.infer<typeof ContextModeSchema>

export const ProfileFilterConfigSchema = z.enum(['core', 'pro', 'expert', 'all'])
export type ProfileFilterConfig = z.infer<typeof ProfileFilterConfigSchema>

/**
 * V11 Copilot Bridge — browser-use orchestration via Copilot LLM bridge.
 * Disabled by default; flipping `enabled=true` activates the
 * `browser_pilot_run` MCP tool.
 */
export const BrowserAutomationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    bridgeUrl: z
      .string()
      .regex(/^https?:\/\//, 'bridgeUrl must start with http:// or https://')
      .default('http://127.0.0.1:9876/v1'),
    defaultModel: z.enum(BROWSER_PILOT_MODELS).default('claude-3.5-sonnet'),
    defaultCdpUrl: z.string().min(1).optional(),
    allowedDomains: z.array(z.string().min(1)).default([]),
    forbiddenCdpMethods: z.array(z.string().min(1)).default(['Browser.close']),
    maxStepsDefault: z.number().int().min(1).max(100).default(25),
    tokenBudgetPerDay: z.number().int().nonnegative().optional(),
  })
  .default({
    enabled: false,
    bridgeUrl: 'http://127.0.0.1:9876/v1',
    defaultModel: 'claude-3.5-sonnet',
    allowedDomains: [],
    forbiddenCdpMethods: ['Browser.close'],
    maxStepsDefault: 25,
  })

export type BrowserAutomationConfig = z.infer<typeof BrowserAutomationConfigSchema>

/**
 * Flow / "transient hypofrontality" context-dilution config.
 *
 * Default-OFF: with `enabled=false` the context pipeline behaves identically to
 * before. Implements the visual sub-equation λ_flow = λ_base + (α · Φ(t)) and a
 * pinned-invariant floor (constraints/risks/decisions/AC never decay).
 */
export const FlowConfigSchema = z.object({
  /** Master switch. OFF = byte-identical legacy context behaviour. */
  enabled: z.boolean().default(false),
  /** λ_base — minimum architectural forgetting rate. */
  lambdaBase: z.number().min(0).default(0.15),
  /** α — hypofrontality accelerator (weight of Φ on λ_flow). */
  alpha: z.number().min(0).default(1.5),
  /** BFS depth used to pull distant pinned invariants back into scope. */
  maxDepth: z.number().int().min(0).max(6).default(3),
  /** Peripheral neighbours below this decayed weight are pruned (unless pinned). */
  weightThreshold: z.number().min(0).max(1).default(0.1),
  /** EMA gain per consecutive success when computing Φ. */
  emaGain: z.number().min(0).max(1).default(0.34),
  /** Multiplier applied to Φ on a failure (0 = hard reset → re-hydrate memory). */
  resetFactor: z.number().min(0).max(1).default(0),
  /** Damping fraction of `emaGain` applied on a `partial` outcome. */
  partialFactor: z.number().min(0).max(1).default(0.5),
  /** rag budget is never scaled below this fraction of baseline (long-range safety). */
  budgetFloorRatio: z.number().min(0).max(1).default(0.25),
  /**
   * Ceiling on distant pinned invariants pulled in per context build, ranked
   * by heat-kernel relevance to the focus node. Fix for the real A/B
   * regression (flow_on inflated tokens -105.5% in a spec-node-rich graph —
   * risk node_db3cf9a2e2b1): an uncapped BFS pull-in of pinnedTypes at
   * maxDepth can outweigh what peripheral pruning saves.
   */
  maxPinnedPullIn: z.number().int().min(1).default(8),
  /** How many recent task outcomes feed Φ. */
  historyWindow: z.number().int().min(1).max(200).default(12),
  /** Node types that are never diluted. */
  pinnedTypes: z
    .array(z.string())
    .default(['constraint', 'risk', 'decision', 'acceptance_criteria', 'constitution', 'requirement']),
  /** A/B experiment: alternate flow_on/flow_off deterministically per node to measure impact. */
  experiment: z.object({ abEnabled: z.boolean().default(false) }).default({ abEnabled: false }),
})

export type FlowConfig = z.infer<typeof FlowConfigSchema>

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  dbPath: z.string().default('workflow-graph'),
  basePath: z.string().optional(),
  contextMode: ContextModeSchema.default('lean'),
  profile: ProfileFilterConfigSchema.default('all'),
  dashboard: z
    .object({
      autoOpen: z.boolean().default(true),
    })
    .default({ autoOpen: true }),
  integrations: z
    .object({
      codeGraphAutoIndex: z.boolean().default(true),
      codeGraphReindexIntervalSec: z.number().int().min(0).default(0),
      lspServers: z.array(LspConfigOverrideSchema).default([]),
      browserAutomation: BrowserAutomationConfigSchema,
    })
    .prefault({}),
  flow: FlowConfigSchema.prefault({}),
})

export type McpGraphConfig = z.infer<typeof ConfigSchema>
