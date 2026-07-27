/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-hooks — E7-T1: Zod v4 schemas for per-tool lifecycle hooks.
 */

import { z } from 'zod/v4'

export const ToolHookEventSchema = z.enum(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'])

export type ToolHookEvent = z.infer<typeof ToolHookEventSchema>

export const ToolHookConfigSchema = z.object({
  tool: z.string().describe("Tool name or '*' for all tools"),
  event: ToolHookEventSchema,
  command: z.string().describe('Shell command executed with JSON via stdin'),
  timeoutMs: z.number().int().positive().default(5000),
})

export type ToolHookConfig = z.infer<typeof ToolHookConfigSchema>

export const HookResultSchema = z.object({
  allow: z.boolean(),
  updatedInput: z.unknown().optional(),
  warnings: z.array(z.string()).optional(),
})

export type HookResult = z.infer<typeof HookResultSchema>
