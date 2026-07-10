/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const DelegationTaskSchema = z.object({
  objective: z.string().min(1).describe('What the child agent should accomplish'),
  allowedTools: z.array(z.string()).min(1).describe('Tools the child agent can use'),
  parentNodeId: z.string().optional().describe('Graph node this delegation relates to'),
  timeoutMs: z.number().int().positive().optional().default(300_000).describe('Timeout in ms (default 5 min)'),
})

export type DelegationTask = z.infer<typeof DelegationTaskSchema>

export const DelegationResultSchema = z.object({
  delegationId: z.string(),
  status: z.enum(['completed', 'failed', 'timeout']),
  summary: z.string(),
  tokensUsed: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
})

export type DelegationResult = z.infer<typeof DelegationResultSchema>

export const DelegationEntrySchema = z.object({
  id: z.string(),
  parentAgentId: z.string(),
  childAgentId: z.string(),
  objective: z.string(),
  allowedTools: z.string(), // JSON array
  status: z.enum(['running', 'completed', 'failed', 'timeout']),
  resultSummary: z.string().nullable(),
  tokensUsed: z.number().int().default(0),
  depth: z.number().int().default(1),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export type DelegationEntry = z.infer<typeof DelegationEntrySchema>
