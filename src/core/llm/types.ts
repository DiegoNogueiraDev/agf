/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * MCP-Graph Proxy — LLM SDK type system.
 * Single source of truth via Zod v4 schemas; TypeScript types inferred.
 * v1 contract: non-streaming only (ADR-proxy-04).
 */

import { z } from 'zod/v4'

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ModelTierSchema = z.enum(['cheap', 'mid', 'expensive', 'local'])
export type ModelTier = z.infer<typeof ModelTierSchema>

export const ProviderNameSchema = z.enum([
  'anthropic',
  'openrouter',
  'openai',
  'copilot',
  'ollama',
  'local-hub',
  // §EPIC-E1 — provider-router-expansion (plan: resilient-hatching-tome.md)
  'gemini',
  'bedrock',
  'azure',
  'deepseek',
  'glm',
  'kimi',
  'groq',
])
export type ProviderName = z.infer<typeof ProviderNameSchema>

export const PricingSchema = z.object({
  inputPerMtok: z.number().nonnegative(),
  outputPerMtok: z.number().nonnegative(),
  /** Cache read rate (Anthropic: ~10% of input rate). */
  cachedInputPerMtok: z.number().nonnegative().optional(),
  /** Cache write rate (Anthropic: ~25% of input rate). */
  cacheCreationInputPerMtok: z.number().nonnegative().optional(),
})
export type Pricing = z.infer<typeof PricingSchema>

/**
 * §EPIC-E1 — provider-router-expansion / Task E1.9
 *
 * Tool-call parser id declared on a ModelSpec when the underlying model emits
 * tool calls in a raw-text format (instead of native function-call JSON).
 * The gateway exposes lookupToolCallParser(modelId) so the agent loop can
 * post-process the response. Optional — most models native JSON return null.
 */
export const ToolCallParserIdSchema = z.enum(['hermes', 'deepseek-v3', 'glm-4', 'kimi-k2', 'qwen3-coder'])
export type ToolCallParserId = z.infer<typeof ToolCallParserIdSchema>

export const ModelSpecSchema = z.object({
  id: z.string().min(1),
  provider: ProviderNameSchema,
  tier: ModelTierSchema,
  contextWindow: z.number().int().positive(),
  pricing: PricingSchema,
  /** Optional parser id for backends that emit raw-text tool calls. */
  toolCallParserId: ToolCallParserIdSchema.optional(),
})
export type ModelSpec = z.infer<typeof ModelSpecSchema>

export const LlmUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Tokens served from prompt cache (cache read). Anthropic: cache_read_input_tokens. */
  cachedInputTokens: z.number().int().nonnegative().optional(),
  /** Tokens written into prompt cache this turn. Anthropic: cache_creation_input_tokens. */
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  /** Output tokens spent on reasoning/thinking (o1/o3/deepseek-r1). */
  reasoningTokens: z.number().int().nonnegative().optional(),
})
export type LlmUsage = z.infer<typeof LlmUsageSchema>

export const CallContextSchema = z.object({
  caller: z.string().min(1),
  cellId: z.string().optional(),
  runId: z.string().optional(),
  projectId: z.string().optional(),
  /** §extracta-cost-observability — session-scoped budget aggregation. */
  sessionId: z.string().optional(),
  /** Graph node ID for per-task token attribution. */
  nodeId: z.string().optional(),
})
export type CallContext = z.infer<typeof CallContextSchema>

export const LlmRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  /** stream:true requires an adapter that implements generateStream (ADR-proxy-04 v2). */
  stream: z.boolean().optional(),
  providerExtras: z.record(z.string(), z.unknown()).optional(),
})
export type LlmRequest = z.infer<typeof LlmRequestSchema>

export const LlmResponseSchema = z.object({
  /** Discriminant for future streaming chunks (ADR-proxy-04). */
  kind: z.literal('final').optional(),
  model: z.string().min(1),
  content: z.string(),
  usage: LlmUsageSchema,
  raw: z.unknown().optional(),
})
export type LlmResponse = z.infer<typeof LlmResponseSchema>

export const EmbedRequestSchema = z.object({
  model: z.string().default('text-embedding-3-small'),
  input: z.union([z.string(), z.array(z.string())]),
})
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>

export const EmbedResponseSchema = z.object({
  vectors: z.array(z.array(z.number())).min(1),
  usage: z.object({ inputTokens: z.number().int().nonnegative() }),
})
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>

export const BudgetScopeSchema = z.object({
  scope: z.enum(['cell', 'run', 'project', 'session']),
  scopeId: z.string().optional(),
  currentUsd: z.number().nonnegative(),
  capUsd: z.number().nonnegative(),
})
export type BudgetScope = z.infer<typeof BudgetScopeSchema>
