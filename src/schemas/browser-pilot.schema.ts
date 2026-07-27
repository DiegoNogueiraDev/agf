/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * browser-pilot — Zod schemas for the `browser_pilot_run` MCP tool.
 *
 * Source-of-truth contract between mcp-graph and the browser-use child
 * process. Input is what the LLM/agent provides; output success carries
 * the agent transcript + screenshots + tokens; error surfaces one of
 * eight stable codes from the plan (see `BROWSER_PILOT_ERROR_CODES`).
 *
 * Plan: ~/.claude/plans/immutable-weaving-ocean.md (Sprint 1 Task 9).
 */

import { z } from 'zod/v4'

/** Models exposed via the Copilot bridge. Added/removed as Copilot's catalog evolves. */
export const BROWSER_PILOT_MODELS = ['claude-3.5-sonnet', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'] as const
export type BrowserPilotModel = (typeof BROWSER_PILOT_MODELS)[number]

export const SCREENSHOT_MODES = ['none', 'key_steps', 'every_step'] as const
export type ScreenshotMode = (typeof SCREENSHOT_MODES)[number]

/**
 * Stable error codes — every error response MUST use one of these. New
 * categories require a plan update before the enum is widened.
 */
export const BROWSER_PILOT_ERROR_CODES = [
  'copilot_consent_denied',
  'copilot_unavailable',
  'bridge_unreachable',
  'cdp_ws_unreachable',
  'browser_use_crash',
  'quota_exceeded',
  'timeout',
  'domain_blocked',
] as const
export type BrowserPilotErrorCode = (typeof BROWSER_PILOT_ERROR_CODES)[number]

// ── Input ────────────────────────────────────────────────────────────────────

export const BrowserPilotInputSchema = z.object({
  prompt: z.string().min(1).describe('Natural-language task for the agent (required).'),
  wsEndpoint: z
    .string()
    .min(1)
    .optional()
    .describe('CDP WebSocket URL (e.g. ws://127.0.0.1:9222/...). Falls back to session > config.'),
  model: z.enum(BROWSER_PILOT_MODELS).optional().describe('Copilot model override. Default comes from config.'),
  maxSteps: z.number().int().min(1).max(100).default(25).describe('Hard cap on agent action steps. Default: 25.'),
  allowedDomains: z
    .array(z.string().min(1))
    .optional()
    .describe('Whitelist of domains the agent may navigate to. Glob patterns allowed (e.g. *.example.com).'),
  sessionId: z.string().min(1).optional().describe('Resume / share a Chrome session by ID.'),
  screenshotMode: z
    .enum(SCREENSHOT_MODES)
    .default('key_steps')
    .describe('none | key_steps | every_step. Default: key_steps.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(180_000)
    .describe('Wall-clock timeout for the whole run. Default: 180_000 ms (3 min).'),
})

export type BrowserPilotInput = z.infer<typeof BrowserPilotInputSchema>

// ── Output (success) ─────────────────────────────────────────────────────────

const ActionLogEntrySchema = z.object({
  step: z.number().int().nonnegative(),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  observation: z.string(),
})

const ScreenshotEntrySchema = z.object({
  step: z.number().int().nonnegative(),
  uri: z.string().min(1),
})

const TokenUsageSchema = z.object({
  prompt: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export const BrowserPilotOutputSchema = z.object({
  success: z.literal(true),
  result: z.string(),
  actionLog: z.array(ActionLogEntrySchema),
  screenshots: z.array(ScreenshotEntrySchema),
  tokens: TokenUsageSchema,
  model: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  runId: z.string().min(1).describe('Cross-link with runs-store entry'),
})

export type BrowserPilotOutput = z.infer<typeof BrowserPilotOutputSchema>

// ── Output (error) ───────────────────────────────────────────────────────────

const BrowserPilotErrorBodySchema = z.object({
  code: z.enum(BROWSER_PILOT_ERROR_CODES),
  message: z.string().min(1),
  hint: z.string().min(1).optional(),
  retriable: z.boolean(),
})

export const BrowserPilotErrorSchema = z.object({
  success: z.literal(false),
  error: BrowserPilotErrorBodySchema,
})

export type BrowserPilotError = z.infer<typeof BrowserPilotErrorSchema>

/** Discriminated union — every browser_pilot_run response is one of these. */
export const BrowserPilotResponseSchema = z.discriminatedUnion('success', [
  BrowserPilotOutputSchema,
  BrowserPilotErrorSchema,
])

export type BrowserPilotResponse = z.infer<typeof BrowserPilotResponseSchema>
